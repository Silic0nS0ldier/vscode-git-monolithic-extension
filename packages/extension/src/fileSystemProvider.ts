/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Disposable,
    Event,
    EventEmitter,
    FileChangeEvent,
    FileChangeType,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    Uri,
    window,
    workspace,
} from "vscode";
import type { Model, ModelChangeEvent, OriginalResourceChangeEvent } from "./model.js";
import { debounce } from "./package-patches/just-debounce.js";
import { throat } from "./package-patches/throat.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import { fromGitUri, toGitUri } from "./uri.js";
import { EmptyDisposable, eventToPromise, filterEvent, isDescendant, pathEquals } from "./util.js";

interface CacheRow {
    uri: Uri;
    timestamp: number;
}

const THREE_MINUTES = 1000 * 60 * 3;
const FIVE_MINUTES = 1000 * 60 * 5;

function sanitizeRef(ref: string, path: string, repository: AbstractRepository): string {
    if (ref === "~") {
        const fileUri = Uri.file(path);
        const uriString = fileUri.toString();
        const [indexStatus] = repository.sourceControlUI.stagedGroup.resourceStates.get().filter(r =>
            r.state.resourceUri.toString() === uriString
        );
        return indexStatus ? "" : "HEAD";
    }

    if (/^~\d$/.test(ref)) {
        return `:${ref[1]}`;
    }

    return ref;
}

export class GitFileSystemProvider implements FileSystemProvider {
    #onDidChangeFileEmitter = new EventEmitter<FileChangeEvent[]>();
    readonly onDidChangeFile: Event<FileChangeEvent[]> = this.#onDidChangeFileEmitter.event;

    #changedRepositoryRoots = new Set<string>();
    #cache = new Map<string, CacheRow>();
    #mtime = new Date().getTime();
    #disposables: Disposable[] = [];
    #model: Model;

    constructor(model: Model) {
        this.#model = model;
        this.#disposables.push(
            this.#model.onDidChangeRepository(this.#onDidChangeRepository, this),
            this.#model.onDidChangeOriginalResource(this.#onDidChangeOriginalResource, this),
            workspace.registerFileSystemProvider("git", this, { isCaseSensitive: true, isReadonly: true }),
            // workspace.registerResourceLabelFormatter({
            // 	scheme: 'git',
            // 	formatting: {
            // 		label: '${path} (git)',
            // 		separator: '/'
            // 	}
            // })
        );

        setInterval(() => this.#cleanup(), FIVE_MINUTES);
    }

    #onDidChangeRepository({ repository }: ModelChangeEvent): void {
        this.#changedRepositoryRoots.add(repository.root);
        this.#eventuallyFireChangeEvents();
    }

    #onDidChangeOriginalResource({ uri }: OriginalResourceChangeEvent): void {
        if (uri.scheme !== "file") {
            return;
        }

        const gitUri = toGitUri(uri, "", { replaceFileExtension: true });
        this.#mtime = new Date().getTime();
        this.#onDidChangeFileEmitter.fire([{ type: FileChangeType.Changed, uri: gitUri }]);
    }

    #fireChangeEvents = throat(1, async () => {
        if (!window.state.focused) {
            const onDidFocusWindow = filterEvent(window.onDidChangeWindowState, e => e.focused);
            await eventToPromise(onDidFocusWindow);
        }

        const events: FileChangeEvent[] = [];

        for (const { uri } of this.#cache.values()) {
            const fsPath = uri.fsPath;

            for (const root of this.#changedRepositoryRoots) {
                if (isDescendant(root, fsPath)) {
                    events.push({ type: FileChangeType.Changed, uri });
                    break;
                }
            }
        }

        if (events.length > 0) {
            this.#mtime = new Date().getTime();
            this.#onDidChangeFileEmitter.fire(events);
        }

        this.#changedRepositoryRoots.clear();
    });

    #eventuallyFireChangeEvents = debounce(this.#fireChangeEvents, 1100);

    #cleanup(): void {
        const now = new Date().getTime();
        const cache = new Map<string, CacheRow>();

        for (const row of this.#cache.values()) {
            const { path } = fromGitUri(row.uri);
            const isOpen = workspace.textDocuments
                .filter(d => d.uri.scheme === "file")
                .some(d => pathEquals(d.uri.fsPath, path));

            if (isOpen || now - row.timestamp < THREE_MINUTES) {
                cache.set(row.uri.toString(), row);
            } else {
                // TODO: should fire delete events?
            }
        }

        this.#cache = cache;
    }

    watch(): Disposable {
        return EmptyDisposable;
    }

    async stat(uri: Uri): Promise<FileStat> {
        await this.#model.isInitialized();

        const { submoduleOf, path, ref } = fromGitUri(uri);
        const repository = submoduleOf ? this.#model.getRepository(submoduleOf) : this.#model.getRepository(uri);
        if (!repository) {
            throw FileSystemError.FileNotFound();
        }

        let size = 0;
        try {
            const details = await repository.getObjectDetails(sanitizeRef(ref, path, repository), path);
            size = details.size;
        } catch {
            // noop
        }
        return { ctime: 0, mtime: this.#mtime, size: size, type: FileType.File };
    }

    readDirectory(): Thenable<[string, FileType][]> {
        throw new Error("Method not implemented.");
    }

    createDirectory(): void {
        throw new Error("Method not implemented.");
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        await this.#model.isInitialized();

        const { path, ref, submoduleOf } = fromGitUri(uri);

        if (submoduleOf) {
            const repository = this.#model.getRepository(submoduleOf);

            if (!repository) {
                throw FileSystemError.FileNotFound();
            }

            const encoder = new TextEncoder();

            if (ref === "index") {
                return encoder.encode(await repository.diffIndexWithHEAD(path));
            } else {
                return encoder.encode(await repository.diffWithHEAD(path));
            }
        }

        const repository = this.#model.getRepository(uri);

        if (!repository) {
            throw FileSystemError.FileNotFound();
        }

        const timestamp = new Date().getTime();
        const cacheValue: CacheRow = { timestamp, uri };

        this.#cache.set(uri.toString(), cacheValue);

        try {
            return await repository.buffer(sanitizeRef(ref, path, repository), path);
        } catch (err) {
            return new Uint8Array(0);
        }
    }

    writeFile(): void {
        throw new Error("Method not implemented.");
    }

    delete(): void {
        throw new Error("Method not implemented.");
    }

    rename(): void {
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        this.#disposables.forEach(d => d.dispose());
    }
}
