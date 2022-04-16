/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Disposable, Event, EventEmitter, Uri, workspace } from "vscode";
import type { Branch, RemoteSourceProvider } from "./api/git.js";
import * as i18n from "./i18n/mod.js";
import type { IRemoteSourceProviderRegistry } from "./remoteProvider.js";
import { Operation } from "./repository/Operations.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
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
            command: "git.checkout",
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
    readonly remoteSourceProviders: RemoteSourceProvider[];
}

class SyncStatusBar {
    #onDidChangeEmitter = new EventEmitter<void>();
    get onDidChange(): Event<void> {
        return this.#onDidChangeEmitter.event;
    }
    #disposables: Disposable[] = [];

    #stateStore: SyncStatusBarState;
    get #state() {
        return this.#stateStore;
    }
    set #state(state: SyncStatusBarState) {
        this.#stateStore = state;
        this.#onDidChangeEmitter.fire();
    }

    #repository: AbstractRepository;
    #remoteSourceProviderRegistry: IRemoteSourceProviderRegistry;

    constructor(
        repository: AbstractRepository,
        remoteSourceProviderRegistry: IRemoteSourceProviderRegistry,
    ) {
        this.#repository = repository;
        this.#remoteSourceProviderRegistry = remoteSourceProviderRegistry;
        this.#stateStore = {
            HEAD: undefined,
            enabled: true,
            hasRemotes: false,
            isSyncRunning: false,
            remoteSourceProviders: this.#remoteSourceProviderRegistry.getRemoteProviders()
                .filter(p => !!p.publishRepository),
        };

        this.#repository.onDidChangeStatus(this.#onDidGitStatusChange, this, this.#disposables);
        this.#repository.onDidChangeOperations(this.#onDidChangeOperations, this, this.#disposables);

        anyEvent(
            this.#remoteSourceProviderRegistry.onDidAddRemoteSourceProvider,
            this.#remoteSourceProviderRegistry.onDidRemoveRemoteSourceProvider,
        )(this.#onDidChangeRemoteSourceProviders, this, this.#disposables);

        const onEnablementChange = filterEvent(
            workspace.onDidChangeConfiguration,
            e => e.affectsConfiguration("git.enableStatusBarSync"),
        );
        onEnablementChange(this.#updateEnablement, this, this.#disposables);
        this.#updateEnablement();
    }

    #updateEnablement(): void {
        const config = workspace.getConfiguration("git", Uri.file(this.#repository.root));
        const enabled = config.get<boolean>("enableStatusBarSync", true);

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

    #onDidChangeRemoteSourceProviders(): void {
        this.#state = {
            ...this.#state,
            remoteSourceProviders: this.#remoteSourceProviderRegistry.getRemoteProviders()
                .filter(p => !!p.publishRepository),
        };
    }

    get command(): Command | undefined {
        if (!this.#state.enabled) {
            return;
        }

        if (!this.#state.hasRemotes) {
            if (this.#state.remoteSourceProviders.length === 0) {
                return;
            }

            const tooltip = i18n.Translations.publishTo(
                this.#state.remoteSourceProviders.length === 1
                    ? this.#state.remoteSourceProviders[0].name
                    : undefined,
            );

            return {
                arguments: [this.#repository.sourceControlUI.sourceControl],
                command: "git.publish",
                title: `$(cloud-upload)`,
                tooltip,
            };
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

                const config = workspace.getConfiguration("git", Uri.file(this.#repository.root));
                const rebaseWhenSync = config.get<string>("rebaseWhenSync");

                command = rebaseWhenSync ? "git.syncRebase" : "git.sync";
                tooltip = this.#repository.syncTooltip;
            } else {
                icon = "$(cloud-upload)";
                command = "git.publish";
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

    constructor(repository: AbstractRepository, remoteSourceProviderRegistry: IRemoteSourceProviderRegistry) {
        this.#syncStatusBar = new SyncStatusBar(repository, remoteSourceProviderRegistry);
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
