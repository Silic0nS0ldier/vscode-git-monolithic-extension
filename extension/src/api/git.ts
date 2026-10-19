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
    | "NoRemoteReference"
    | "NoRemoteRepositorySpecified"
    | "NoStashFound"
    | "NotAGitRepository"
    | "NotAtRepositoryRoot"
    | "NoUpstreamBranch"
    | "NoUserEmailConfigured"
    | "NoUserNameConfigured"
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
    NoRemoteReference: "NoRemoteReference",
    NoRemoteRepositorySpecified: "NoRemoteRepositorySpecified",
    NoStashFound: "NoStashFound",
    NoUpstreamBranch: "NoUpstreamBranch",
    NoUserEmailConfigured: "NoUserEmailConfigured",
    NoUserNameConfigured: "NoUserNameConfigured",
    NotAGitRepository: "NotAGitRepository",
    NotAtRepositoryRoot: "NotAtRepositoryRoot",
    PermissionDenied: "PermissionDenied",
    PushRejected: "PushRejected",
    RemoteConnectionError: "RemoteConnectionError",
    RepositoryIsLocked: "RepositoryIsLocked",
    RepositoryNotFound: "RepositoryNotFound",
    StashConflict: "StashConflict",
    UnknownPath: "UnknownPath",
    UnmergedChanges: "UnmergedChanges",
};
