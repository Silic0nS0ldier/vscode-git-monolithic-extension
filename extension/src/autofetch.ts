/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    type ConfigurationChangeEvent,
    ConfigurationTarget,
    Disposable,
    EventEmitter,
    type Memento,
    type MessageItem,
    Uri,
    window,
    workspace,
} from "vscode";
import { GitErrorCodes } from "./api/git.js";
import { GitError } from "./git/error.js";
import * as i18n from "./i18n/mod.js";
import { Operation, type OperationOptions } from "./repository/Operations.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import * as config from "./util/config.js";
import { eventToPromise, filterEvent, onceEvent } from "./util/events.js";

function isRemoteOperation(operation: OperationOptions): boolean {
    return operation === Operation.Pull || operation === Operation.Push || operation === Operation.Sync
        || operation === Operation.Fetch;
}

export class AutoFetcher {
    static #DidInformUser = "autofetch.didInformUser";

    #onDidChangeEmitter = new EventEmitter<boolean>();
    #onDidChange = this.#onDidChangeEmitter.event;

    #enabled: boolean = false;
    #fetchAll: boolean = false;
    get enabled(): boolean {
        return this.#enabled;
    }
    set enabled(enabled: boolean) {
        this.#enabled = enabled;
        this.#onDidChangeEmitter.fire(enabled);
    }

    #disposables: Disposable[] = [];

    #repository: AbstractRepository;
    #globalState: Memento;

    constructor(repository: AbstractRepository, globalState: Memento) {
        this.#repository = repository;
        this.#globalState = globalState;
        workspace.onDidChangeConfiguration(this.#onConfiguration, this, this.#disposables);
        this.#onConfiguration();

        const onGoodRemoteOperation = filterEvent(
            this.#repository.onDidRunOperation,
            ({ operation, error }) => !error && isRemoteOperation(operation),
        );
        const onFirstGoodRemoteOperation = onceEvent(onGoodRemoteOperation);
        onFirstGoodRemoteOperation(this.#onFirstGoodRemoteOperation, this, this.#disposables);
    }

    async #onFirstGoodRemoteOperation(): Promise<void> {
        const didInformUser = !this.#globalState.get<boolean>(AutoFetcher.#DidInformUser);

        if (this.enabled && !didInformUser) {
            this.#globalState.update(AutoFetcher.#DidInformUser, true);
        }

        const shouldInformUser = !this.enabled && didInformUser;

        if (!shouldInformUser) {
            return;
        }

        const yesMsg: MessageItem = { title: i18n.Translations.yes() };
        const noMsg: MessageItem = { isCloseAffordance: true, title: i18n.Translations.no() };
        const askLaterMsg: MessageItem = { title: i18n.Translations.askLater() };
        const result = await window.showInformationMessage(
            i18n.Translations.suggestAutoFetch(),
            yesMsg,
            noMsg,
            askLaterMsg,
        );

        if (result === askLaterMsg) {
            return;
        }

        if (result === yesMsg) {
            const gitConfig = config.legacy(Uri.file(this.#repository.root));
            gitConfig.update("autofetch", true, ConfigurationTarget.Global);
        }

        this.#globalState.update(AutoFetcher.#DidInformUser, true);
    }

    #onConfiguration(e?: ConfigurationChangeEvent): void {
        if (e !== undefined && !e.affectsConfiguration("git.autofetch")) {
            return;
        }

        switch (config.autoFetch(Uri.file(this.#repository.root))) {
            case true:
                this.#fetchAll = false;
                this.enable();
                break;
            case "all":
                this.#fetchAll = true;
                this.enable();
                break;
            case false:
            default:
                this.#fetchAll = false;
                this.disable();
                break;
        }
    }

    enable(): void {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        this.#run();
    }

    disable(): void {
        this.enabled = false;
    }

    async #run(): Promise<void> {
        while (this.enabled) {
            await this.#repository.whenIdleAndFocused();

            if (!this.enabled) {
                return;
            }

            try {
                if (this.#fetchAll) {
                    await this.#repository.fetchAll();
                } else {
                    await this.#repository.fetchDefault({ silent: true });
                }
            } catch (err) {
                if (err instanceof GitError && err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
                    this.disable();
                }
            }

            if (!this.enabled) {
                return;
            }

            const period = config.autoFetchPeriod(Uri.file(this.#repository.root))
                * 1000;
            const timeout = new Promise(c => setTimeout(c, period));
            const whenDisabled = eventToPromise(filterEvent(this.#onDidChange, enabled => !enabled));

            await Promise.race([timeout, whenDisabled]);
        }
    }

    dispose(): void {
        this.disable();
        this.#disposables.forEach(d => d.dispose());
    }
}
