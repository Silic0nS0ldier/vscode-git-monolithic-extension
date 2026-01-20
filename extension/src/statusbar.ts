/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Command, Disposable, type Event, EventEmitter, Uri, workspace } from "vscode";
import type { Branch } from "./api/git.js";
import * as i18n from "./i18n/mod.js";
import { Operation } from "./repository/Operations.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import * as config from "./util/config.js";
import { dispose } from "./util/disposals.js";
import { anyEvent, filterEvent } from "./util/events.js";

class CheckoutStatusBar {
    #onDidChangeEmitter = new EventEmitter<void>();
    get onDidChange(): Event<void> {
        return this.#onDidChangeEmitter.event;
    }
    #disposables: Disposable[] = [];
    #repository: AbstractRepository;

    constructor(repository: AbstractRepository) {
        this.#repository = repository;
        this.#repository.onDidChangeStatus(this.#onDidChangeEmitter.fire, this.#onDidChangeEmitter, this.#disposables);
    }

    get command(): Command | undefined {
        const rebasing = !!this.#repository.rebaseCommit;
        const title = `$(git-branch) ${this.#repository.headLabel}${
            rebasing ? ` (${i18n.Translations.rebasing()})` : ""
        }`;

        return {
            arguments: [this.#repository.sourceControlUI.sourceControl],
            command: "git_monolithic.checkout",
            title,
            tooltip: i18n.Translations.checkout(),
        };
    }

    dispose(): void {
        this.#disposables.forEach(d => d.dispose());
    }
}

interface SyncStatusBarState {
    readonly enabled: boolean;
    readonly isSyncRunning: boolean;
    readonly hasRemotes: boolean;
    readonly HEAD: Branch | undefined;
}

class SyncStatusBar {
    #onDidChangeEmitter = new EventEmitter<void>();
    get onDidChange(): Event<void> {
        return this.#onDidChangeEmitter.event;
    }
    #disposables: Disposable[] = [];

    #stateStore: SyncStatusBarState;
    get #state(): SyncStatusBarState {
        return this.#stateStore;
    }
    set #state(state: SyncStatusBarState) {
        this.#stateStore = state;
        this.#onDidChangeEmitter.fire();
    }

    #repository: AbstractRepository;

    constructor(
        repository: AbstractRepository,
    ) {
        this.#repository = repository;
        this.#stateStore = {
            HEAD: undefined,
            enabled: true,
            hasRemotes: false,
            isSyncRunning: false
        };

        this.#repository.onDidChangeStatus(this.#onDidGitStatusChange, this, this.#disposables);
        this.#repository.onDidChangeOperations(this.#onDidChangeOperations, this, this.#disposables);

        const onEnablementChange = filterEvent(
            workspace.onDidChangeConfiguration,
            e => config.enableStatusBarSync.affected(e),
        );
        onEnablementChange(this.#updateEnablement, this, this.#disposables);
        this.#updateEnablement();
    }

    #updateEnablement(): void {
        const enabled = config.enableStatusBarSync(Uri.file(this.#repository.root));

        this.#state = { ...this.#state, enabled };
    }

    #onDidChangeOperations(): void {
        const isSyncRunning = this.#repository.operations.isRunning(Operation.Sync)
            || this.#repository.operations.isRunning(Operation.Push)
            || this.#repository.operations.isRunning(Operation.Pull);

        this.#state = { ...this.#state, isSyncRunning };
    }

    #onDidGitStatusChange(): void {
        this.#state = {
            ...this.#state,
            HEAD: this.#repository.HEAD,
            hasRemotes: this.#repository.remotes.length > 0,
        };
    }

    get command(): Command | undefined {
        if (!this.#state.enabled) {
            return;
        }

        if (!this.#state.hasRemotes) {
            return;
        }

        const HEAD = this.#state.HEAD;
        let icon = "$(sync)";
        let text = "";
        let command = "";
        let tooltip = "";

        if (HEAD && HEAD.name && HEAD.commit) {
            if (HEAD.upstream) {
                if (HEAD.ahead || HEAD.behind) {
                    text += this.#repository.syncLabel;
                }

                const rebaseWhenSync = config.rebaseWhenSync(Uri.file(this.#repository.root));

                command = rebaseWhenSync ? "git_monolithic.syncRebase" : "git_monolithic.sync";
                tooltip = this.#repository.syncTooltip;
            } else {
                icon = "$(cloud-upload)";
                command = "git_monolithic.publish";
                tooltip = i18n.Translations.publishChanges();
            }
        } else {
            command = "";
            tooltip = "";
        }

        if (this.#state.isSyncRunning) {
            icon = "$(sync~spin)";
            command = "";
            tooltip = i18n.Translations.syncingChanges();
        }

        return {
            arguments: [this.#repository.sourceControlUI.sourceControl],
            command,
            title: [icon, text].join(" ").trim(),
            tooltip,
        };
    }

    dispose(): void {
        this.#disposables.forEach(d => d.dispose());
    }
}

export class StatusBarCommands {
    readonly onDidChange: Event<void>;

    #syncStatusBar: SyncStatusBar;
    #checkoutStatusBar: CheckoutStatusBar;
    #disposables: Disposable[] = [];

    constructor(repository: AbstractRepository) {
        this.#syncStatusBar = new SyncStatusBar(repository);
        this.#checkoutStatusBar = new CheckoutStatusBar(repository);
        this.onDidChange = anyEvent(this.#syncStatusBar.onDidChange, this.#checkoutStatusBar.onDidChange);
    }

    get commands(): Command[] {
        return [this.#checkoutStatusBar.command, this.#syncStatusBar.command]
            .filter((c): c is Command => !!c);
    }

    dispose(): void {
        this.#syncStatusBar.dispose();
        this.#checkoutStatusBar.dispose();
        this.#disposables = dispose(this.#disposables);
    }
}
