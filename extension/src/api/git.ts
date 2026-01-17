/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable, Event, ProviderResult, Uri } from "vscode";
import type { GitError } from "../git/error.js";
export type { ProviderResult } from "vscode";

export interface Git {
    readonly path: string;
}

export interface InputBox {
    value: string;
}

export type ForcePushModeOptions = "Force" | "ForceWithLease";
export const ForcePushMode: Record<ForcePushModeOptions, ForcePushModeOptions> = {
    Force: "Force",
    ForceWithLease: "ForceWithLease",
};

export type RefTypeOptions = "Head" | "RemoteHead" | "Tag";
export const RefType: Record<RefTypeOptions, RefTypeOptions> = {
    Head: "Head",
    RemoteHead: "RemoteHead",
    Tag: "Tag",
};

export interface Ref {
    readonly type: RefTypeOptions;
    readonly name?: string;
    readonly commit?: string;
    readonly remote?: string;
}

export interface UpstreamRef {
    readonly remote: string;
    readonly name: string;
}

export interface Branch extends Ref {
    readonly upstream?: UpstreamRef;
    readonly ahead?: number;
    readonly behind?: number;
}

export interface Commit {
    readonly hash: string;
    readonly message: string;
    readonly parents: string[];
    readonly authorDate?: Date;
    readonly authorName?: string;
    readonly authorEmail?: string;
    readonly commitDate?: Date;
}

export interface Submodule {
    readonly name: string;
    readonly path: string;
    readonly url: string;
}

export interface Remote {
    readonly name: string;
    readonly fetchUrl?: string;
    readonly pushUrl?: string;
    readonly isReadOnly: boolean;
}

export type StatusOptions =
    | "ADDED_BY_THEM"
    | "ADDED_BY_US"
    | "BOTH_ADDED"
    | "BOTH_DELETED"
    | "BOTH_MODIFIED"
    | "DELETED_BY_THEM"
    | "DELETED_BY_US"
    | "DELETED"
    | "DELETED"
    | "IGNORED"
    | "INDEX_ADDED"
    | "INDEX_COPIED"
    | "INDEX_DELETED"
    | "INDEX_MODIFIED"
    | "INDEX_RENAMED"
    | "INTENT_TO_ADD"
    | "MODIFIED"
    | "UNTRACKED";
export const Status: Record<StatusOptions, StatusOptions> = {
    ADDED_BY_THEM: "ADDED_BY_THEM",
    ADDED_BY_US: "ADDED_BY_US",
    BOTH_ADDED: "BOTH_ADDED",
    BOTH_DELETED: "BOTH_DELETED",
    BOTH_MODIFIED: "BOTH_MODIFIED",
    DELETED: "DELETED",
    DELETED_BY_THEM: "DELETED_BY_THEM",
    DELETED_BY_US: "DELETED_BY_US",
    IGNORED: "IGNORED",
    INDEX_ADDED: "INDEX_ADDED",
    INDEX_COPIED: "INDEX_COPIED",
    INDEX_DELETED: "INDEX_DELETED",
    INDEX_MODIFIED: "INDEX_MODIFIED",
    INDEX_RENAMED: "INDEX_RENAMED",
    INTENT_TO_ADD: "INTENT_TO_ADD",
    MODIFIED: "MODIFIED",
    UNTRACKED: "UNTRACKED",
};

export interface Change {
    /**
     * Returns either `originalUri` or `renameUri`, depending
     * on whether this change is a rename change. When
     * in doubt always use `uri` over the other two alternatives.
     */
    readonly uri: Uri;
    readonly originalUri: Uri;
    readonly renameUri: Uri | undefined;
    readonly status: StatusOptions;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly refs: Ref[];
    readonly remotes: Remote[];
    readonly submodules: Submodule[];
    readonly rebaseCommit: Commit | undefined;

    readonly mergeChanges: Change[];
    readonly indexChanges: Change[];
    readonly workingTreeChanges: Change[];

    readonly onDidChange: Event<void>;
}

export interface RepositoryUIState {
    readonly selected: boolean;
    readonly onDidChange: Event<void>;
}

/**
 * Log options.
 */
export interface LogOptions {
    /** Max number of log entries to retrieve. If not specified, the default is 32. */
    readonly maxEntries?: number;
    readonly path?: string;
}

export interface CommitOptions {
    all?: boolean | "tracked";
    amend?: boolean;
    signoff?: boolean;
    signCommit?: boolean;
    empty?: boolean;
    noVerify?: boolean;
    requireUserConfig?: boolean;
}

export interface FetchOptions {
    remote?: string;
    ref?: string;
    all?: boolean;
    prune?: boolean;
    depth?: number;
}

export interface BranchQuery {
    readonly remote?: boolean;
    readonly pattern?: string;
    readonly count?: number;
    readonly contains?: string;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly inputBox: InputBox;
    readonly state: RepositoryState;
    readonly ui: RepositoryUIState;

    getConfigs(): Promise<{ key: string; value: string }[]>;
    getConfig(key: string): Promise<string>;
    setConfig(key: string, value: string): Promise<string>;
    getGlobalConfig(key: string): Promise<string>;

    getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }>;
    buffer(ref: string, path: string): Promise<Buffer>;
    getCommit(ref: string): Promise<Commit>;

    clean(paths: string[]): Promise<void>;

    apply(patch: string, reverse?: boolean): Promise<void>;
    diff(cached?: boolean): Promise<string>;
    diffWithHEAD(path: string): Promise<string>;
    diffWith(ref: string, path: string): Promise<string>;
    diffIndexWithHEAD(path: string): Promise<string>;
    diffIndexWith(ref: string, path: string): Promise<string>;
    diffBlobs(object1: string, object2: string): Promise<string>;
    diffBetween(ref1: string, ref2: string, path: string): Promise<string>;

    hashObject(data: string): Promise<string>;

    createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
    deleteBranch(name: string, force?: boolean): Promise<void>;
    getBranch(name: string): Promise<Branch>;
    getBranches(query: BranchQuery): Promise<Ref[]>;
    setBranchUpstream(name: string, upstream: string): Promise<void>;

    getMergeBase(ref1: string, ref2: string): Promise<string>;

    status(): Promise<void>;
    checkout(treeish: string): Promise<void>;

    addRemote(name: string, url: string): Promise<void>;
    removeRemote(name: string): Promise<void>;
    renameRemote(name: string, newName: string): Promise<void>;

    fetch(options?: FetchOptions): Promise<void>;
    fetch(remote?: string, ref?: string, depth?: number): Promise<void>;
    pull(unshallow?: boolean): Promise<void>;
    push(remoteName?: string, branchName?: string, setUpstream?: boolean, force?: ForcePushModeOptions): Promise<void>;

    blame(path: string): Promise<string>;
    log(options?: LogOptions): Promise<Commit[]>;

    commit(message: string, opts?: CommitOptions): Promise<void>;
}

export interface RemoteSource {
    readonly name: string;
    readonly description?: string;
    readonly url: string | string[];
}

export interface RemoteSourceProvider {
    readonly name: string;
    readonly icon?: string; // codicon name
    readonly supportsQuery?: boolean;
    getRemoteSources(query?: string): ProviderResult<RemoteSource[]>;
    getBranches?(url: string): ProviderResult<string[]>;
    publishRepository?(repository: Repository): Promise<void>;
}

export interface Credentials {
    readonly username: string;
    readonly password: string;
}

export interface CredentialsProvider {
    getCredentials(host: Uri): ProviderResult<Credentials>;
}

export interface PushErrorHandler {
    handlePushError(
        repository: Repository,
        remote: Remote,
        refspec: string,
        error: GitError,
    ): Promise<boolean>;
}

export type APIState = "uninitialized" | "initialized";

export interface PublishEvent {
    repository: Repository;
    branch?: string;
}

export interface API {
    readonly state: APIState;
    readonly onDidChangeState: Event<APIState>;
    readonly onDidPublish: Event<PublishEvent>;
    readonly git: Git;
    readonly repositories: Repository[];
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;

    toGitUri(uri: Uri, ref: string): Uri;
    getRepository(uri: Uri): Repository | null;
    init(root: Uri): Promise<Repository | null>;
    openRepository(root: Uri): Promise<Repository | null>;

    registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable;
    registerCredentialsProvider(provider: CredentialsProvider): Disposable;
    registerPushErrorHandler(handler: PushErrorHandler): Disposable;
}

export type GitErrorCodesOptions =
    | "AuthenticationFailed"
    | "BadConfigFile"
    | "BranchAlreadyExists"
    | "BranchNotFullyMerged"
    | "CantAccessRemote"
    | "CantCreatePipe"
    | "CantLockRef"
    | "CantOpenResource"
    | "CantRebaseMultipleBranches"
    | "Conflict"
    | "DirtyWorkTree"
    | "GitNotFound"
    | "InvalidBranchName"
    | "IsInSubmodule"
    | "LocalChangesOverwritten"
    | "NoLocalChanges"
    | "NoPathFound"
    | "NoRemoteReference"
    | "NoRemoteRepositorySpecified"
    | "NoStashFound"
    | "NotAGitRepository"
    | "NotAtRepositoryRoot"
    | "NoUpstreamBranch"
    | "NoUserEmailConfigured"
    | "NoUserNameConfigured"
    | "PatchDoesNotApply"
    | "PermissionDenied"
    | "PushRejected"
    | "RemoteConnectionError"
    | "RepositoryIsLocked"
    | "RepositoryNotFound"
    | "StashConflict"
    | "UnknownPath"
    | "UnmergedChanges"
    | "WrongCase";
export const GitErrorCodes: Record<GitErrorCodesOptions, GitErrorCodesOptions> = {
    AuthenticationFailed: "AuthenticationFailed",
    BadConfigFile: "BadConfigFile",
    BranchAlreadyExists: "BranchAlreadyExists",
    BranchNotFullyMerged: "BranchNotFullyMerged",
    CantAccessRemote: "CantAccessRemote",
    CantCreatePipe: "CantCreatePipe",
    CantLockRef: "CantLockRef",
    CantOpenResource: "CantOpenResource",
    CantRebaseMultipleBranches: "CantRebaseMultipleBranches",
    Conflict: "Conflict",
    DirtyWorkTree: "DirtyWorkTree",
    GitNotFound: "GitNotFound",
    InvalidBranchName: "InvalidBranchName",
    IsInSubmodule: "IsInSubmodule",
    LocalChangesOverwritten: "LocalChangesOverwritten",
    NoLocalChanges: "NoLocalChanges",
    NoPathFound: "NoPathFound",
    NoRemoteReference: "NoRemoteReference",
    NoRemoteRepositorySpecified: "NoRemoteRepositorySpecified",
    NoStashFound: "NoStashFound",
    NoUpstreamBranch: "NoUpstreamBranch",
    NoUserEmailConfigured: "NoUserEmailConfigured",
    NoUserNameConfigured: "NoUserNameConfigured",
    NotAGitRepository: "NotAGitRepository",
    NotAtRepositoryRoot: "NotAtRepositoryRoot",
    PatchDoesNotApply: "PatchDoesNotApply",
    PermissionDenied: "PermissionDenied",
    PushRejected: "PushRejected",
    RemoteConnectionError: "RemoteConnectionError",
    RepositoryIsLocked: "RepositoryIsLocked",
    RepositoryNotFound: "RepositoryNotFound",
    StashConflict: "StashConflict",
    UnknownPath: "UnknownPath",
    UnmergedChanges: "UnmergedChanges",
    WrongCase: "WrongCase",
};
