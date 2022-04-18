/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "node:path";
import {
    Disposable,
    Event,
    EventEmitter,
    FileDecoration,
    FileDecorationProvider,
    TextDocument,
    ThemeColor,
    Uri,
    window,
    workspace,
} from "vscode";
import { GitErrorCodes, Status } from "./api/git.js";
import { GitError } from "./git/error.js";
import type { Model } from "./model.js";
import { debounce } from "./package-patches/just-debounce.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import type { SourceControlResourceGroupUI } from "./ui/source-control.js";
import { dispose as disposeHelper } from "./util/disposals.js";
import { anyEvent, filterEvent, fireEvent } from "./util/events.js";
import { isExpectedError } from "./util/is-expected-error.js";
import { PromiseSource } from "./util/promise-source.js";

class GitIgnoreDecorationProvider implements FileDecorationProvider {
    static #Decoration: FileDecoration = { color: new ThemeColor("gitDecoration.ignoredResourceForeground") };

    readonly onDidChangeFileDecorations: Event<undefined>;
    #queue = new Map<
        string,
        { repository: AbstractRepository; queue: Map<string, PromiseSource<FileDecoration | undefined>> }
    >();
    #disposables: Disposable[] = [];
    #model: Model;

    constructor(model: Model) {
        this.#model = model;
        const sources = anyEvent<TextDocument | AbstractRepository>(
            filterEvent(workspace.onDidSaveTextDocument, e => /\.gitignore$|\.git\/info\/exclude$/.test(e.uri.path)),
            this.#model.onDidOpenRepository,
            this.#model.onDidCloseRepository,
        );
        this.onDidChangeFileDecorations = fireEvent(listener => sources(() => listener(undefined)));

        this.#disposables.push(window.registerFileDecorationProvider(this));
    }

    async provideFileDecoration(uri: Uri): Promise<FileDecoration | undefined> {
        const repository = this.#model.getRepository(uri);

        if (!repository) {
            return;
        }

        let queueItem = this.#queue.get(repository.root);

        if (!queueItem) {
            queueItem = { queue: new Map<string, PromiseSource<FileDecoration | undefined>>(), repository };
            this.#queue.set(repository.root, queueItem);
        }

        let promiseSource = queueItem.queue.get(uri.fsPath);

        if (!promiseSource) {
            promiseSource = new PromiseSource();
            queueItem.queue.set(uri.fsPath, promiseSource);
            this.#checkIgnoreSoon();
        }

        return await promiseSource.promise;
    }

    #checkIgnoreSoon = debounce(() => {
        const queue = new Map(this.#queue.entries());
        this.#queue.clear();

        for (const [, item] of queue) {
            const paths = [...item.queue.keys()];

            item.repository.checkIgnore(paths).then(ignoreSet => {
                for (const [path, promiseSource] of item.queue.entries()) {
                    promiseSource.resolve(ignoreSet.has(path) ? GitIgnoreDecorationProvider.#Decoration : undefined);
                }
            }, err => {
                if (!isExpectedError(err, GitError, e => e.gitErrorCode === GitErrorCodes.IsInSubmodule)) {
                    // TODO This is logged into oblivion
                    console.error(err);
                }

                for (const [, promiseSource] of item.queue.entries()) {
                    promiseSource.reject(err);
                }
            });
        }
    }, 500);

    dispose(): void {
        this.#disposables.forEach(d => d.dispose());
        this.#queue.clear();
    }
}

function collectDecorationData(group: SourceControlResourceGroupUI, bucket: Map<string, FileDecoration>): void {
    for (const r of group.resourceStates.get()) {
        const decoration = r.state.resourceDecoration;

        if (decoration) {
            // not deleted and has a decoration
            bucket.set(r.state.original.toString(), decoration);

            if (r.state.type === Status.INDEX_RENAMED) {
                bucket.set(r.state.resourceUri.toString(), decoration);
            }
        }
    }
}

class GitDecorationProvider implements FileDecorationProvider {
    static #SubmoduleDecorationData: FileDecoration = {
        badge: "S",
        color: new ThemeColor("gitDecoration.submoduleResourceForeground"),
        tooltip: "Submodule",
    };

    readonly #onDidChangeDecorationsEmitter = new EventEmitter<Uri[]>();
    readonly onDidChangeFileDecorations: Event<Uri[]> = this.#onDidChangeDecorationsEmitter.event;

    #disposables: Disposable[] = [];
    #decorations = new Map<string, FileDecoration>();
    #repository: AbstractRepository;

    constructor(repository: AbstractRepository) {
        this.#repository = repository;
        this.#disposables.push(
            window.registerFileDecorationProvider(this),
            this.#repository.onDidChangeStatus(this.#onDidGitStatusChange, this),
        );
    }

    #onDidGitStatusChange(): void {
        let newDecorations = new Map<string, FileDecoration>();

        this.#collectSubmoduleDecorationData(newDecorations);
        collectDecorationData(this.#repository.sourceControlUI.stagedGroup, newDecorations);
        collectDecorationData(this.#repository.sourceControlUI.untrackedGroup, newDecorations);
        collectDecorationData(this.#repository.sourceControlUI.trackedGroup, newDecorations);
        collectDecorationData(this.#repository.sourceControlUI.mergeGroup, newDecorations);

        const uris = new Set([...this.#decorations.keys()].concat([...newDecorations.keys()]));
        this.#decorations = newDecorations;
        this.#onDidChangeDecorationsEmitter.fire([...uris.values()].map(value => Uri.parse(value, true)));
    }

    #collectSubmoduleDecorationData(bucket: Map<string, FileDecoration>): void {
        for (const submodule of this.#repository.submodules) {
            bucket.set(
                Uri.file(path.join(this.#repository.root, submodule.path)).toString(),
                GitDecorationProvider.#SubmoduleDecorationData,
            );
        }
    }

    provideFileDecoration(uri: Uri): FileDecoration | undefined {
        return this.#decorations.get(uri.toString());
    }

    dispose(): void {
        this.#disposables.forEach(d => d.dispose());
    }
}

export function addDecorations(model: Model): Disposable {
    const disposables: Disposable[] = [
        new GitIgnoreDecorationProvider(model),
    ];
    const modelDisposables: Disposable[] = [];
    const providers = new Map<AbstractRepository, Disposable>();

    const onEnablementChange = filterEvent(
        workspace.onDidChangeConfiguration,
        e => e.affectsConfiguration("git.decorations.enabled"),
    );

    function onDidCloseRepository(repository: AbstractRepository): void {
        const provider = providers.get(repository);

        if (provider) {
            provider.dispose();
            providers.delete(repository);
        }
    }

    function onDidOpenRepository(repository: AbstractRepository): void {
        const provider = new GitDecorationProvider(repository);
        providers.set(repository, provider);
    }

    function enable(): void {
        modelDisposables.push(model.onDidOpenRepository(onDidOpenRepository));
        modelDisposables.push(model.onDidCloseRepository(onDidCloseRepository));
        model.repositories.forEach(onDidOpenRepository);
    }

    function disable(): void {
        disposeHelper(modelDisposables);
        modelDisposables.length = 0;
        providers.forEach(value => value.dispose());
        providers.clear();
    }

    function update(): void {
        const enabled = workspace.getConfiguration("git").get("decorations.enabled");

        if (enabled) {
            enable();
        } else {
            disable();
        }
    }

    disposables.push(onEnablementChange(update));

    update();

    return {
        dispose(): void {
            disable();
            disposeHelper(disposables);
            disposables.length = 0;
        },
    };
}
