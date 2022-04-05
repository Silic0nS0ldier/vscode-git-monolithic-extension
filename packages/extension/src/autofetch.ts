/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    ConfigurationChangeEvent,
    ConfigurationTarget,
    Disposable,
    EventEmitter,
    Memento,
    MessageItem,
    Uri,
    window,
    workspace,
} from "vscode";
import { GitErrorCodes } from "./api/git.js";
import { Operation, OperationOptions } from "./repository/Operations.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import { eventToPromise, filterEvent, localize, onceEvent } from "./util.js";

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

        const yes: MessageItem = { title: localize("yes", "Yes") };
        const no: MessageItem = { isCloseAffordance: true, title: localize("no", "No") };
        const askLater: MessageItem = { title: localize("not now", "Ask Me Later") };
        const result = await window.showInformationMessage(
            localize(
                "suggest auto fetch",
                "Would you like Code to [periodically run 'git fetch']({0})?",
                "https://go.microsoft.com/fwlink/?linkid=865294",
            ),
            yes,
            no,
            askLater,
        );

        if (result === askLater) {
            return;
        }

        if (result === yes) {
            const gitConfig = workspace.getConfiguration("git", Uri.file(this.#repository.root));
            gitConfig.update("autofetch", true, ConfigurationTarget.Global);
        }

        this.#globalState.update(AutoFetcher.#DidInformUser, true);
    }

    #onConfiguration(e?: ConfigurationChangeEvent): void {
        if (e !== undefined && !e.affectsConfiguration("git.autofetch")) {
            return;
        }

        const gitConfig = workspace.getConfiguration("git", Uri.file(this.#repository.root));
        switch (gitConfig.get<boolean | "all">("autofetch")) {
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
                if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
                    this.disable();
                }
            }

            if (!this.enabled) {
                return;
            }

            const period =
                workspace.getConfiguration("git", Uri.file(this.#repository.root)).get<number>("autofetchPeriod", 180)
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
