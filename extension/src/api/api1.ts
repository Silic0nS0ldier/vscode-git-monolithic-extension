/* eslint-disable class-methods-use-this */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, type Event, type SourceControlInputBox, Uri } from "vscode";
import type { Model } from "../model.js";
import { pickRemoteSource, type PickRemoteSourceOptions } from "../remoteSource.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import type { Resource } from "../repository/Resource.js";
import { toGitUri } from "../uri.js";
import { mapEvent } from "../util/events.js";
import type { GitExtensionImpl } from "./extension.js";
import {
    type API,
    type APIState,
    type Branch,
    type BranchQuery,
    type Change,
    type Commit,
    type CommitOptions,
    type CredentialsProvider,
    type FetchOptions,
    type ForcePushModeOptions,
    type Git,
    type InputBox,
    type LogOptions,
    type PublishEvent,
    type PushErrorHandler,
    type Ref,
    RefType,
    type RefTypeOptions,
    type Remote,
    type RemoteSourceProvider,
    type Repository,
    type RepositoryState,
    type RepositoryUIState,
    Status,
    type StatusOptions,
    type Submodule,
} from "./git.js";

class ApiInputBox implements InputBox {
    set value(value: string) {
        this.#inputBox.value = value;
    }
    get value(): string {
        return this.#inputBox.value;
    }
    #inputBox: SourceControlInputBox;
    constructor(inputBox: SourceControlInputBox) {
        this.#inputBox = inputBox;
    }
}

export class ApiChange implements Change {
    get uri(): Uri {
        return this.#resource.state.resourceUri;
    }
    get originalUri(): Uri {
        return this.#resource.state.original;
    }
    get renameUri(): Uri | undefined {
        return this.#resource.state.renameResourceUri;
    }
    get status(): StatusOptions {
        return this.#resource.state.type;
    }

    readonly #resource: Resource;

    constructor(resource: Resource) {
        this.#resource = resource;
    }
}

export class ApiRepositoryState implements RepositoryState {
    get HEAD(): Branch | undefined {
        return this.#repository.HEAD;
    }
    get refs(): Ref[] {
        return [...this.#repository.refs];
    }
    get remotes(): Remote[] {
        return [...this.#repository.remotes];
    }
    get submodules(): Submodule[] {
        return [...this.#repository.submodules];
    }
    get rebaseCommit(): Commit | undefined {
        return this.#repository.rebaseCommit;
    }

    get mergeChanges(): Change[] {
        return this.#repository.sourceControlUI.mergeGroup.resourceStates.get().map(r => new ApiChange(r));
    }
    get indexChanges(): Change[] {
        return this.#repository.sourceControlUI.stagedGroup.resourceStates.get().map(r => new ApiChange(r));
    }
    get workingTreeChanges(): Change[] {
        return this.#repository.sourceControlUI.trackedGroup.resourceStates.get().map(r => new ApiChange(r));
    }

    readonly onDidChange: Event<void>;

    #repository: AbstractRepository;

    constructor(repository: AbstractRepository) {
        this.#repository = repository;
        this.onDidChange = this.#repository.onDidChangeStatus;
    }
}

export class ApiRepositoryUIState implements RepositoryUIState {
    get selected(): boolean {
        return false;
        // return this._sourceControl.selected;
    }

    readonly onDidChange: Event<void> = mapEvent<boolean, void>(
        () => ({ dispose(): void {} }),
        // this._sourceControl.onDidChangeSelection,
        () => null,
    );

    constructor() {}
}

export class ApiRepository implements Repository {
    readonly rootUri: Uri;
    readonly inputBox: InputBox;
    readonly state: RepositoryState;
    readonly ui: RepositoryUIState = new ApiRepositoryUIState();
    #repository: AbstractRepository;

    constructor(repository: AbstractRepository) {
        this.#repository = repository;
        this.rootUri = Uri.file(this.#repository.root);
        this.inputBox = new ApiInputBox(this.#repository.sourceControlUI.sourceControl.inputBox);
        this.state = new ApiRepositoryState(this.#repository);
    }

    apply(patch: string, reverse?: boolean): Promise<void> {
        return this.#repository.apply(patch, reverse);
    }

    getConfigs(): Promise<{ key: string; value: string }[]> {
        return this.#repository.getConfigs();
    }

    getConfig(key: string): Promise<string> {
        return this.#repository.getConfig(key);
    }

    async setConfig(key: string, value: string): Promise<string> {
        await this.#repository.setConfig(key, value);
        return "";
    }

    getGlobalConfig(key: string): Promise<string> {
        return this.#repository.getGlobalConfig(key);
    }

    getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }> {
        return this.#repository.getObjectDetails(treeish, path);
    }

    buffer(ref: string, filePath: string): Promise<Buffer> {
        return this.#repository.buffer(ref, filePath);
    }

    getCommit(ref: string): Promise<Commit> {
        return this.#repository.getCommit(ref);
    }

    clean(paths: string[]): Promise<void> {
        return this.#repository.clean(paths.map(p => Uri.file(p)));
    }

    diff(cached?: boolean): Promise<string> {
        return this.#repository.diff(cached);
    }

    diffWithHEAD(path: string): Promise<string> {
        return this.#repository.diffWithHEAD(path);
    }

    diffWith(ref: string, path: string): Promise<string> {
        return this.#repository.diffWith(ref, path);
    }

    diffIndexWithHEAD(path: string): Promise<string> {
        return this.#repository.diffIndexWithHEAD(path);
    }

    diffIndexWith(ref: string, path: string): Promise<string> {
        return this.#repository.diffIndexWith(ref, path);
    }

    diffBlobs(object1: string, object2: string): Promise<string> {
        return this.#repository.diffBlobs(object1, object2);
    }

    diffBetween(ref1: string, ref2: string, path: string): Promise<string> {
        return this.#repository.diffBetween(ref1, ref2, path);
    }

    hashObject(data: string): Promise<string> {
        return this.#repository.hashObject(data);
    }

    createBranch(name: string, checkout: boolean, ref?: string | undefined): Promise<void> {
        return this.#repository.branch(name, checkout, ref);
    }

    deleteBranch(name: string, force?: boolean): Promise<void> {
        return this.#repository.deleteBranch(name, force);
    }

    getBranch(name: string): Promise<Branch> {
        return this.#repository.getBranch(name);
    }

    getBranches(query: BranchQuery): Promise<Ref[]> {
        return this.#repository.getBranches(query);
    }

    setBranchUpstream(name: string, upstream: string): Promise<void> {
        return this.#repository.setBranchUpstream(name, upstream);
    }

    getMergeBase(ref1: string, ref2: string): Promise<string> {
        return this.#repository.getMergeBase(ref1, ref2);
    }

    status(): Promise<void> {
        return this.#repository.status();
    }

    checkout(treeish: string): Promise<void> {
        return this.#repository.checkout(treeish);
    }

    addRemote(name: string, url: string): Promise<void> {
        return this.#repository.addRemote(name, url);
    }

    removeRemote(name: string): Promise<void> {
        return this.#repository.removeRemote(name);
    }

    renameRemote(name: string, newName: string): Promise<void> {
        return this.#repository.renameRemote(name, newName);
    }

    fetch(
        arg0?: FetchOptions | string | undefined,
        ref?: string | undefined,
        depth?: number | undefined,
        prune?: boolean | undefined,
    ): Promise<void> {
        if (arg0 !== undefined && typeof arg0 !== "string") {
            return this.#repository.fetch(arg0);
        }

        return this.#repository.fetch({ depth, prune, ref, remote: arg0 });
    }

    pull(unshallow?: boolean): Promise<void> {
        return this.#repository.pull(undefined, unshallow);
    }

    push(
        remoteName?: string,
        branchName?: string,
        setUpstream: boolean = false,
        force?: ForcePushModeOptions,
    ): Promise<void> {
        return this.#repository.pushTo(remoteName, branchName, setUpstream, force);
    }

    blame(path: string): Promise<string> {
        return this.#repository.blame(path);
    }

    log(options?: LogOptions): Promise<Commit[]> {
        return this.#repository.log(options);
    }

    commit(message: string, opts?: CommitOptions): Promise<void> {
        return this.#repository.commit(message, opts);
    }
}

export class ApiGit implements Git {
    get path(): string {
        return this.#model.git.path;
    }
    #model: Model;
    constructor(model: Model) {
        this.#model = model;
    }
}

export class ApiImpl implements API {
    readonly git: ApiGit;

    get state(): APIState {
        return this.#model.state;
    }

    get onDidChangeState(): Event<APIState> {
        return this.#model.onDidChangeState;
    }

    get onDidPublish(): Event<PublishEvent> {
        return this.#model.onDidPublish;
    }

    get onDidOpenRepository(): Event<Repository> {
        return mapEvent(this.#model.onDidOpenRepository, r => new ApiRepository(r));
    }

    get onDidCloseRepository(): Event<Repository> {
        return mapEvent(this.#model.onDidCloseRepository, r => new ApiRepository(r));
    }

    get repositories(): Repository[] {
        return this.#model.repositories.map(r => new ApiRepository(r));
    }

    toGitUri(uri: Uri, ref: string): Uri {
        return toGitUri(uri, ref);
    }

    getRepository(uri: Uri): Repository | null {
        const result = this.#model.getRepository(uri);
        return result ? new ApiRepository(result) : null;
    }

    async init(root: Uri): Promise<Repository | null> {
        const path = root.fsPath;
        await this.#model.git.init(path);
        await this.#model.openRepository(path);
        return this.getRepository(root) || null;
    }

    async openRepository(root: Uri): Promise<Repository | null> {
        await this.#model.openRepository(root.fsPath);
        return this.getRepository(root) || null;
    }

    registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable {
        return this.#model.registerRemoteSourceProvider(provider);
    }

    registerCredentialsProvider(provider: CredentialsProvider): Disposable {
        return this.#model.registerCredentialsProvider(provider);
    }

    registerPushErrorHandler(handler: PushErrorHandler): Disposable {
        return this.#model.registerPushErrorHandler(handler);
    }

    #model: Model;

    constructor(model: Model) {
        this.#model = model;
        this.git = new ApiGit(this.#model);
    }
}

function getRefType(type: RefTypeOptions): string {
    switch (type) {
        case RefType.Head:
            return "Head";
        case RefType.RemoteHead:
            return "RemoteHead";
        case RefType.Tag:
            return "Tag";
    }

    return "unknown";
}

function getStatus(status: StatusOptions): string {
    switch (status) {
        case Status.INDEX_MODIFIED:
            return "INDEX_MODIFIED";
        case Status.INDEX_ADDED:
            return "INDEX_ADDED";
        case Status.INDEX_DELETED:
            return "INDEX_DELETED";
        case Status.INDEX_RENAMED:
            return "INDEX_RENAMED";
        case Status.INDEX_COPIED:
            return "INDEX_COPIED";
        case Status.MODIFIED:
            return "MODIFIED";
        case Status.DELETED:
            return "DELETED";
        case Status.UNTRACKED:
            return "UNTRACKED";
        case Status.IGNORED:
            return "IGNORED";
        case Status.INTENT_TO_ADD:
            return "INTENT_TO_ADD";
        case Status.ADDED_BY_US:
            return "ADDED_BY_US";
        case Status.ADDED_BY_THEM:
            return "ADDED_BY_THEM";
        case Status.DELETED_BY_US:
            return "DELETED_BY_US";
        case Status.DELETED_BY_THEM:
            return "DELETED_BY_THEM";
        case Status.BOTH_ADDED:
            return "BOTH_ADDED";
        case Status.BOTH_DELETED:
            return "BOTH_DELETED";
        case Status.BOTH_MODIFIED:
            return "BOTH_MODIFIED";
    }

    return "UNKNOWN";
}

// TODO This may not be needed
export function registerAPICommands(extension: GitExtensionImpl): Disposable {
    const disposables: Disposable[] = [];

    disposables.push(commands.registerCommand("git_monolithic.api.getRepositories", () => {
        const api = extension.getAPI(1);
        return api.repositories.map(r => r.rootUri.toString());
    }));

    disposables.push(commands.registerCommand("git_monolithic.api.getRepositoryState", (uri: string) => {
        const api = extension.getAPI(1);
        const repository = api.getRepository(Uri.parse(uri));

        if (!repository) {
            return null;
        }

        const state = repository.state;

        const ref = (ref: Ref | undefined) => (ref && { ...ref, type: getRefType(ref.type) });
        const change = (change: Change) => ({
            originalUri: change.originalUri.toString(),
            renameUri: change.renameUri?.toString(),
            status: getStatus(change.status),
            uri: change.uri.toString(),
        });

        return {
            HEAD: ref(state.HEAD),
            indexChanges: state.indexChanges.map(change),
            mergeChanges: state.mergeChanges.map(change),
            rebaseCommit: state.rebaseCommit,
            refs: state.refs.map(ref),
            remotes: state.remotes,
            submodules: state.submodules,
            workingTreeChanges: state.workingTreeChanges.map(change),
        };
    }));

    disposables.push(commands.registerCommand("git_monolithic.api.getRemoteSources", (opts?: PickRemoteSourceOptions) => {
        if (!extension.model) {
            return;
        }

        return pickRemoteSource(extension.model, opts as any);
    }));

    return Disposable.from(...disposables);
}
