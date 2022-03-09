import { Disposable, Event, Uri } from "vscode";
import {
    Branch,
    BranchQuery,
    CommitOptions,
    FetchOptions,
    ForcePushMode,
    LogOptions,
    Ref,
    Remote,
} from "../../api/git.js";
import { Commit } from "../../git/Commit.js";
import { LogFileOptions } from "../../git/LogFileOptions.js";
import { Stash } from "../../git/Stash.js";
import { Submodule } from "../../git/Submodule.js";
import { SourceControlUIGroup } from "../../ui/source-control.js";
import { OperationResult } from "../OperationResult.js";
import { Operation } from "../Operations.js";
import { Operations } from "../Operations.js";
import { RepositoryState } from "../RepositoryState.js";

export type AbstractRepository = {
    readonly __type: Symbol;
    readonly ignore: (files: Uri[]) => Promise<void>;
    readonly getInputTemplate: () => Promise<string>;
    readonly headShortName: string | undefined;
    readonly add: (resources: Uri[], opts?: { update?: boolean }) => Promise<void>;
    readonly addRemote: (name: string, url: string) => Promise<void>;
    readonly apply: (patch: string, reverse?: boolean) => Promise<void>;
    readonly applyStash: (index?: number) => Promise<void>;
    readonly blame: (path: string) => Promise<string>;
    readonly branch: (name: string, _checkout: boolean, _ref?: string) => Promise<void>;
    readonly buffer: (ref: string, filePath: string) => Promise<Buffer>;
    readonly checkIgnore: (filePaths: string[]) => Promise<Set<string>>;
    readonly checkout: (treeish: string, opts?: { detached?: boolean }) => Promise<void>;
    readonly checkoutTracking: (treeish: string, opts?: { detached?: boolean }) => Promise<void>;
    readonly cherryPick: (commitHash: string) => Promise<void>;
    readonly clean: (resources: Uri[]) => Promise<void>;
    readonly commit: (message: string | undefined, opts?: CommitOptions) => Promise<void>;
    readonly createStash: (message?: string, includeUntracked?: boolean) => Promise<void>;
    readonly deleteBranch: (name: string, force?: boolean) => Promise<void>;
    readonly deleteRef: (ref: string) => Promise<void>;
    readonly deleteTag: (name: string) => Promise<void>;
    readonly diff: (cached?: boolean) => Promise<string>;
    readonly diffBetween: (ref1: string, ref2: string, path: string) => Promise<string>;
    readonly diffBlobs: (object1: string, object2: string) => Promise<string>;
    readonly diffIndexWith: (ref: string, path: string) => Promise<string>;
    readonly diffIndexWithHEAD: (path: string) => Promise<string>;
    readonly diffWith: (ref: string, path: string) => Promise<string>;
    readonly diffWithHEAD: (path: string) => Promise<string>;
    readonly dropStash: (index?: number) => Promise<void>;
    readonly fetch: (options: FetchOptions) => Promise<void>;
    readonly fetchAll: () => Promise<void>;
    readonly fetchDefault: (options?: { silent?: boolean }) => Promise<void>;
    readonly fetchPrune: () => Promise<void>;
    readonly findTrackingBranches: (upstreamRef: string) => Promise<Branch[]>;
    readonly getBranch: (name: string) => Promise<Branch>;
    readonly getBranches: (query: BranchQuery) => Promise<Ref[]>;
    readonly getCommit: (ref: string) => Promise<Commit>;
    readonly getConfig: (key: string) => Promise<string>;
    readonly getConfigs: () => Promise<{ key: string; value: string }[]>;
    readonly getGlobalConfig: (key: string) => Promise<string>;
    readonly getMergeBase: (ref1: string, ref2: string) => Promise<string>;
    readonly getObjectDetails: (
        ref: string,
        filePath: string,
    ) => Promise<{ mode: string; object: string; size: number }>;
    readonly getStashes: () => Promise<Stash[]>;
    readonly getCommitTemplate: () => Promise<string>;
    readonly hashObject: (data: string) => Promise<string>;
    readonly HEAD: Branch | undefined;
    readonly headLabel: string;
    readonly log: (options?: LogOptions) => Promise<Commit[]>;
    readonly logFile: (uri: Uri, options?: LogFileOptions) => Promise<Commit[]>;
    readonly merge: (ref: string) => Promise<void>;
    readonly move: (from: string, to: string) => Promise<void>;
    readonly onDidChangeOperations: Event<Operation | OperationResult>;
    readonly onDidChangeOriginalResource: Event<Uri>;
    readonly onDidChangeRepository: Event<Uri>;
    readonly onDidChangeState: Event<RepositoryState>;
    readonly onDidChangeStatus: Event<void>;
    /** @deprecated use onDidChangeStatus */
    readonly onDidRunGitStatus: Event<void>;
    readonly onDidRunOperation: Event<OperationResult>;
    readonly operations: Operations;
    readonly popStash: (index?: number) => Promise<void>;
    readonly pull: (head?: Branch, unshallow?: boolean) => Promise<void>;
    readonly pullFrom: (rebase?: boolean, remote?: string, branch?: string, unshallow?: boolean) => Promise<void>;
    readonly pullWithRebase: (head: Branch | undefined) => Promise<void>;
    readonly push: (head: Branch, forcePushMode?: ForcePushMode) => Promise<void>;
    readonly pushFollowTags: (remote?: string, forcePushMode?: ForcePushMode) => Promise<void>;
    readonly pushTags: (remote?: string, forcePushMode?: ForcePushMode) => Promise<void>;
    readonly pushTo: (
        remote?: string,
        name?: string,
        setUpstream?: boolean,
        forcePushMode?: ForcePushMode,
    ) => Promise<void>;
    readonly rebase: (branch: string) => Promise<void>;
    readonly rebaseAbort: () => Promise<void>;
    readonly rebaseCommit: Commit | undefined;
    readonly refs: Ref[];
    readonly remotes: readonly Remote[];
    readonly removeRemote: (name: string) => Promise<void>;
    readonly renameBranch: (name: string) => Promise<void>;
    readonly renameRemote: (name: string, newName: string) => Promise<void>;
    readonly reset: (treeish: string, hard?: boolean) => Promise<void>;
    readonly revert: (resources: Uri[]) => Promise<void>;
    readonly rm: (resources: Uri[]) => Promise<void>;
    readonly root: string;
    readonly setBranchUpstream: (name: string, upstream: string) => Promise<void>;
    readonly setConfig: (key: string, value: string) => Promise<string>;
    readonly show: (ref: string, filePath: string) => Promise<string>;
    readonly sourceControlUI: SourceControlUIGroup;
    readonly stage: (resource: Uri, contents: string) => Promise<void>;
    readonly status: () => Promise<void>;
    readonly submodules: readonly Submodule[];
    readonly sync: (head: Branch) => Promise<void>;
    readonly syncLabel: string;
    readonly syncRebase: (head: Branch) => Promise<void>;
    readonly syncTooltip: string;
    readonly tag: (name: string, message?: string) => Promise<void>;
    readonly whenIdleAndFocused: () => Promise<void>;
} & Disposable;
