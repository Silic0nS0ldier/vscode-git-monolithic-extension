/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProviderResult, Uri } from "vscode";

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

interface UpstreamRef {
    readonly remote: string;
    readonly name: string;
}

export interface Branch extends Ref {
    readonly upstream?: UpstreamRef;
    readonly ahead?: number;
    readonly behind?: number;
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

export interface Credentials {
    readonly username: string;
    readonly password: string;
}

export interface CredentialsProvider {
    getCredentials(host: Uri): ProviderResult<Credentials>;
}

export type APIState = "uninitialized" | "initialized";

type GitErrorCodesOptions =
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
    | "UnmergedChanges";
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
};
