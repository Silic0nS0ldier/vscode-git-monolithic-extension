import {
    commands,
    Disposable,
    Event,
    EventEmitter,
    Memento,
    OutputChannel,
    QuickDiffProvider,
    scm,
    SourceControl,
    SourceControlInputBox,
    SourceControlResourceGroup,
    Uri,
    window,
    workspace,
} from "vscode";
import {
    Branch,
    BranchQuery,
    CommitOptions,
    FetchOptions,
    ForcePushMode,
    GitErrorCodes,
    LogOptions,
    Ref,
    RefType,
    Remote,
    Status,
} from "../../api/git.js";
import { AutoFetcher } from "../../autofetch.js";
import { Commit, LogFileOptions, Repository as BaseRepository, Stash, Submodule } from "../../git.js";
import { debounce } from "../../package-patches/just-debounce.js";
import { throat } from "../../package-patches/throat.js";
import { IPushErrorHandlerRegistry } from "../../pushError.js";
import { IRemoteSourceProviderRegistry } from "../../remoteProvider.js";
import { StatusBarCommands } from "../../statusbar.js";
import { toGitUri } from "../../uri.js";
import { anyEvent, Box, createBox, dispose, eventToPromise, filterEvent, localize } from "../../util.js";
import { createDotGitWatcher } from "../../watch/dot-git-watcher.js";
import { createWorkingTreeWatcher } from "../../watch/working-tree-watcher.js";
import { FileEventLogger } from "../FileEventLogger.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { isReadOnly } from "../isReadOnly.js";
import { Operation } from "../Operations.js";
import { OperationResult } from "../OperationResult.js";
import { Operations, OperationsImpl } from "../Operations.js";
import { ProgressManager } from "../ProgressManager.js";
import { RepositoryState } from "../RepositoryState.js";
import { retryRun } from "../retryRun.js";
import { timeout } from "../timeout.js";
import { buffer as bufferImpl } from "./buffer.js";
import { clean as cleanImpl } from "./clean.js";
import { commit as commitImpl } from "./commit.js";
import { fetch as fetchImpl } from "./fetch.js";
import { getConfig as getConfigImpl, getConfigs as getConfigsImpl, getGlobalConfig } from "./get-config.js";
import { headLabel as headLabelImpl } from "./head-label.js";
import { pullFrom as pullFromImpl } from "./pull-from.js";
import { pullWithRebase as pullWithRebaseImpl } from "./pull-with-rebase.js";
import { pull as pullImpl } from "./pull.js";
import { pushInternal } from "./push-internal.js";
import { push as pushImpl } from "./push.js";
import { show as showImpl } from "./show.js";
import { stage as stageImpl } from "./stage.js";
import { syncInternal } from "./sync-internal.js";
import { syncLabel as syncLabelImpl } from "./sync-label.js";
import { syncTooltip as syncTooltipImpl } from "./sync-tooltip.js";
import { sync as syncImpl } from "./sync.js";
import { updateModelState as updateModelStateImpl } from "./update-model-state.js";
import { ignore as ignoreImpl } from "./ignore.js";
import { getInputTemplate as getInputTemplateImpl } from "./get-input-template.js";
import { checkIgnore as checkIgnoreImpl } from "./check-ignore.js";

function createStateBox(
    onDidChangeState: EventEmitter<RepositoryState>,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    mergeGroup: SourceControlResourceGroup,
    indexGroup: SourceControlResourceGroup,
    workingTreeGroup: SourceControlResourceGroup,
    untrackedGroup: SourceControlResourceGroup,
    sourceControl: SourceControl,
): Box<RepositoryState> {
    let state = RepositoryState.Idle;

    return {
        get: () => state,
        set: (newState: RepositoryState) => {
            state = newState;
            onDidChangeState.fire(state);

            HEAD.set(undefined);
            refs.set([]);
            remotes.set([]);
            mergeGroup.resourceStates = [];
            indexGroup.resourceStates = [];
            workingTreeGroup.resourceStates = [];
            untrackedGroup.resourceStates = [];
            sourceControl.count = 0;
        },
    };
}

function createRebaseCommitBox(
    inputBox: SourceControlInputBox,
): Box<Commit | undefined> {
    let rebaseCommit: Commit | undefined = undefined;

    return {
        get: () => rebaseCommit,
        set: (newRebaseCommit) => {
            if (rebaseCommit && !newRebaseCommit) {
                inputBox.value = "";
            } else if (newRebaseCommit && (!rebaseCommit || rebaseCommit.hash !== newRebaseCommit.hash)) {
                inputBox.value = newRebaseCommit.message;
            }

            rebaseCommit = newRebaseCommit;
            commands.executeCommand("setContext", "gitRebaseInProgress", !!rebaseCommit);
        },
    };
}

const FinalRepositorySymbol = Symbol();

export function isFinalRepository(value: unknown): value is FinalRepository {
    return (value as any).__type === FinalRepositorySymbol;
}

export type FinalRepository = {
    readonly __type: Symbol;
    readonly inputBox: SourceControlInputBox;
    readonly ignore: (files: Uri[]) => Promise<void>;
    readonly getInputTemplate: () => Promise<string>;
    readonly headShortName: string|undefined;
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
    readonly indexGroup: GitResourceGroup;
    readonly log: (options?: LogOptions) => Promise<Commit[]>;
    readonly logFile: (uri: Uri, options?: LogFileOptions) => Promise<Commit[]>;
    readonly merge: (ref: string) => Promise<void>;
    readonly mergeGroup: GitResourceGroup;
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
    readonly revert: (resources: Uri[]) => Promise<void>;
    readonly reset: (treeish: string, hard?: boolean) => Promise<void>;
    readonly rm: (resources: Uri[]) => Promise<void>;
    readonly root: string;
    readonly setBranchUpstream: (name: string, upstream: string) => Promise<void>;
    readonly setConfig: (key: string, value: string) => Promise<string>;
    readonly show: (ref: string, filePath: string) => Promise<string>;
    readonly sourceControl: SourceControl;
    readonly stage: (resource: Uri, contents: string) => Promise<void>;
    readonly status: () => Promise<void>;
    readonly submodules: readonly Submodule[];
    readonly sync: (head: Branch) => Promise<void>;
    readonly syncLabel: string;
    readonly syncRebase: (head: Branch) => Promise<void>;
    readonly syncTooltip: string;
    readonly tag: (name: string, message?: string) => Promise<void>;
    readonly untrackedGroup: GitResourceGroup;
    readonly whenIdleAndFocused: () => Promise<void>;
    readonly workingTreeGroup: GitResourceGroup;
} & Disposable;

export function createRepository(
    repository: BaseRepository,
    remoteSourceProviderRegistry: IRemoteSourceProviderRegistry,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    globalState: Memento,
    outputChannel: OutputChannel,
): FinalRepository {
    const disposables: Disposable[] = [];
    const repoRoot = repository.root;
    const dotGit = repository.dotGit;

    const workingTreeWatcher = createWorkingTreeWatcher(repoRoot);
    disposables.push(workingTreeWatcher);
    const onWorkingTreeFileChange = workingTreeWatcher.event;

    const dotGitFileWatcher = createDotGitWatcher(dotGit, outputChannel);
    disposables.push(dotGitFileWatcher);
    const onDotGitFileChange = dotGitFileWatcher.event;

    const onFileChange = anyEvent(onWorkingTreeFileChange, onDotGitFileChange);

    const isRepositoryHuge = createBox(false);
    const operations = new OperationsImpl();

    const onDidRunOperationEmitter = new EventEmitter<OperationResult>();
    const onDidRunOperation = onDidRunOperationEmitter.event;

    const onDidChangeStateEmitter = new EventEmitter<RepositoryState>();
    const onDidChangeState = onDidChangeStateEmitter.event;

    async function whenIdleAndFocused(): Promise<void> {
        while (true) {
            if (!operations.isIdle()) {
                await eventToPromise(onDidRunOperation);
                continue;
            }

            if (!window.state.focused) {
                const onDidFocusWindow = filterEvent(window.onDidChangeWindowState, e => e.focused);
                await eventToPromise(onDidFocusWindow);
                continue;
            }

            return;
        }
    }

    const HEAD = createBox<Branch|undefined>(undefined);
    const refs = createBox<Ref[]>([]);
    const remotes = createBox<Remote[]>([]);

    const rootUri = Uri.file(repository.root);
    const sourceControl = scm.createSourceControl("git", "Git", rootUri);

    const mergeGroup = sourceControl.createResourceGroup(
        "merge",
        localize("merge changes", "Merge Changes"),
    ) as GitResourceGroup;
    const indexGroup = sourceControl.createResourceGroup(
        "index",
        localize("staged changes", "Staged Changes"),
    ) as GitResourceGroup;
    const workingTreeGroup = sourceControl.createResourceGroup(
        "workingTree",
        localize("changes", "Changes"),
    ) as GitResourceGroup;
    const untrackedGroup = sourceControl.createResourceGroup(
        "untracked",
        localize("untracked changes", "Untracked Changes"),
    ) as GitResourceGroup;

    const state = createStateBox(
        onDidChangeStateEmitter,
        HEAD,
        refs,
        remotes,
        mergeGroup,
        indexGroup,
        workingTreeGroup,
        untrackedGroup,
        sourceControl,
    );

    const onRunOperationEmitter = new EventEmitter<Operation>();
    const onRunOperation = onRunOperationEmitter.event;

    const didWarnAboutLimit = createBox(false);

    const submodules = createBox<Submodule[]>([]);
    const rebaseCommit = createRebaseCommitBox(sourceControl.inputBox);

    function setCountBadge(): void {
        const config = workspace.getConfiguration("git", Uri.file(repository.root));
        const countBadge = config.get<"all" | "tracked" | "off">("countBadge");
        const untrackedChanges = config.get<"mixed" | "separate" | "hidden">("untrackedChanges");

        let count = mergeGroup.resourceStates.length
            + indexGroup.resourceStates.length
            + workingTreeGroup.resourceStates.length;

        switch (countBadge) {
            case "off":
                count = 0;
                break;
            case "tracked":
                if (untrackedChanges === "mixed") {
                    count -= (workingTreeGroup as GitResourceGroup).resourceStates.filter(r =>
                        r.type === Status.UNTRACKED || r.type === Status.IGNORED
                    ).length;
                }
                break;
            case "all":
                if (untrackedChanges === "separate") {
                    count += untrackedGroup.resourceStates.length;
                }
                break;
        }

        sourceControl.count = count;
    }

    const onDidChangeStatusEmitter = new EventEmitter<void>();
    const onDidChangeStatus = onDidChangeStatusEmitter.event;

    const updateModelState = throat(1, async () => {
        return updateModelStateImpl(
            repository,
            isRepositoryHuge,
            didWarnAboutLimit,
            run,
            HEAD,
            refs,
            remotes,
            submodules,
            rebaseCommit,
            repoRoot,
            indexGroup,
            mergeGroup,
            workingTreeGroup,
            untrackedGroup,
            setCountBadge,
            onDidChangeStatusEmitter,
            sourceControl,
        );
    });

    async function run<T>(
        operation: Operation,
        runOperation: () => Promise<T> = () => Promise.resolve<any>(null),
    ): Promise<T> {
        if (state.get() !== RepositoryState.Idle) {
            throw new Error("Repository not initialized");
        }

        let error: any = null;

        operations.start(operation);
        onRunOperationEmitter.fire(operation);

        try {
            const result = await retryRun(operation, runOperation);

            if (!isReadOnly(operation)) {
                await updateModelState();
            }

            return result;
        } catch (err) {
            error = err;

            if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
                state.set(RepositoryState.Disposed);
            }

            throw err;
        } finally {
            operations.end(operation);
            onDidRunOperationEmitter.fire({ error, operation });
        }
    }

    // TODO This should fire on first hit, then again on leading edge if there is another call
    const status = throat(1, () => run<void>(Operation.Status));

    // TODO This should fire on first hit, then again on leading edge if there is another call
    const updateWhenIdleAndWait = throat(1, async () => {
        await whenIdleAndFocused();
        await status();
        await timeout(5000);
    });
    const eventuallyUpdateWhenIdleAndWait = debounce(updateWhenIdleAndWait, 1000);

    function onFileChangeHandler(_uri: Uri): void {
        const config = workspace.getConfiguration("git");
        const autorefresh = config.get<boolean>("autorefresh");

        if (!autorefresh) {
            return;
        }

        if (isRepositoryHuge) {
            return;
        }

        if (!operations.isIdle()) {
            return;
        }

        eventuallyUpdateWhenIdleAndWait();
    }

    onFileChange(onFileChangeHandler, null, disposables);

    const onDidChangeRepositoryEmitter = new EventEmitter<Uri>();
    const onDidChangeRepository = onDidChangeRepositoryEmitter.event;

    // Relevate repository changes should trigger virtual document change events
    onDotGitFileChange(onDidChangeRepositoryEmitter.fire, onDidChangeRepositoryEmitter, disposables);

    disposables.push(new FileEventLogger(onWorkingTreeFileChange, onDotGitFileChange, outputChannel));

    sourceControl.acceptInputCommand = {
        arguments: [sourceControl],
        command: "git.commit",
        title: localize("commit", "Commit"),
    };
    const quickDiffProvider: QuickDiffProvider = {
        provideOriginalResource(uri) {
            if (uri.scheme !== "file") {
                return;
            }

            const path = uri.path;

            if (mergeGroup.resourceStates.some(r => r.resourceUri.path === path)) {
                return undefined;
            }

            return toGitUri(uri, "", { replaceFileExtension: true });
        },
    };
    sourceControl.quickDiffProvider = quickDiffProvider;
    // sourceControl.inputBox.validateInput = this.validateInput.bind(this);
    disposables.push(sourceControl);

    function headShortName(): string | undefined {
        const valueHEAD = HEAD.get();
        if (!valueHEAD) {
            return;
        }

        if (valueHEAD.name) {
            return valueHEAD.name;
        }

        const tag = refs.get().filter(iref => iref.type === RefType.Tag && iref.commit === valueHEAD.commit)[0];
        const tagName = tag && tag.name;

        if (tagName) {
            return tagName;
        }

        return (valueHEAD.commit || "").substring(0, 8);
    }

    function updateInputBoxPlaceholder(): void {
        const branchName = headShortName();

        if (branchName) {
            // '{0}' will be replaced by the corresponding key-command later in the process, which is why it needs to stay.
            sourceControl.inputBox.placeholder = localize(
                "commitMessageWithHeadLabel",
                "Message ({0} to commit on '{1}')",
                "{0}",
                branchName,
            );
        } else {
            sourceControl.inputBox.placeholder = localize("commitMessage", "Message ({0} to commit)");
        }
    }

    updateInputBoxPlaceholder();
    disposables.push(onDidChangeStatus(() => updateInputBoxPlaceholder()));

    const updateIndexGroupVisibility = () => {
        const config = workspace.getConfiguration("git", rootUri);
        indexGroup.hideWhenEmpty = !config.get<boolean>("alwaysShowStagedChangesResourceGroup");
    };

    const onConfigListener = filterEvent(
        workspace.onDidChangeConfiguration,
        e => e.affectsConfiguration("git.alwaysShowStagedChangesResourceGroup", rootUri),
    );
    onConfigListener(updateIndexGroupVisibility, null, disposables);
    updateIndexGroupVisibility();

    filterEvent(
        workspace.onDidChangeConfiguration,
        e => e.affectsConfiguration("git.branchSortOrder", rootUri)
            || e.affectsConfiguration("git.untrackedChanges", rootUri)
            || e.affectsConfiguration("git.ignoreSubmodules", rootUri)
            || e.affectsConfiguration("git.openDiffOnClick", rootUri),
    )(updateModelState, null, disposables);

    const updateInputBoxVisibility = () => {
        const config = workspace.getConfiguration("git", rootUri);
        sourceControl.inputBox.visible = config.get<boolean>("showCommitInput", true);
    };

    const onConfigListenerForInputBoxVisibility = filterEvent(
        workspace.onDidChangeConfiguration,
        e => e.affectsConfiguration("git.showCommitInput", rootUri),
    );
    onConfigListenerForInputBoxVisibility(updateInputBoxVisibility, null, disposables);
    updateInputBoxVisibility();

    mergeGroup.hideWhenEmpty = true;
    untrackedGroup.hideWhenEmpty = true;

    disposables.push(mergeGroup, indexGroup, workingTreeGroup, untrackedGroup);

    function buffer(ref: string, filePath: string): Promise<Buffer> {
        return bufferImpl(run, repository, ref, filePath);
    }

    function show(ref: string, filePath: string): Promise<string> {
        return showImpl(run, repository, ref, filePath);
    }

    const onDidChangeOperations = anyEvent<Operation | OperationResult>(onRunOperation, onDidRunOperation);

    const onDidChangeOriginalResourceEmitter = new EventEmitter<Uri>();
    const onDidChangeOriginalResource = onDidChangeOriginalResourceEmitter.event;

    const finalRepository: FinalRepository = {
        get HEAD() {
            return HEAD.get();
        },
        __type: FinalRepositorySymbol,
        add(resources, opts) {
            return run(Operation.Add, () => repository.add(resources.map(r => r.fsPath), opts));
        },
        addRemote(name, url) {
            return run(Operation.Remote, () => repository.addRemote(name, url));
        },
        apply(patch, reverse) {
            return run(Operation.Apply, () => repository.apply(patch, reverse));
        },
        applyStash(index) {
            return run(Operation.Stash, () => repository.applyStash(index));
        },
        blame(path) {
            return run(Operation.Blame, () => repository.blame(path));
        },
        branch(name, _checkout, _ref) {
            return run(Operation.Branch, () => repository.branch(name, _checkout, _ref));
        },
        buffer,
        checkIgnore(filePaths) {
            return checkIgnoreImpl(run, repoRoot, repository, filePaths);
        },
        checkout(treeish, opts) {
            return run(Operation.Checkout, () => repository.checkout(treeish, [], opts));
        },
        checkoutTracking(treeish, opts = {}) {
            return run(Operation.CheckoutTracking, () => repository.checkout(treeish, [], { ...opts, track: true }));
        },
        cherryPick(commitHash) {
            return run(Operation.CherryPick, () => repository.cherryPick(commitHash));
        },
        clean(resources) {
            return cleanImpl(run, workingTreeGroup, untrackedGroup, submodules.get(), repoRoot, repository, resources);
        },
        commit(message, opts = {}) {
            return commitImpl(run, rebaseCommit.get(), repoRoot, repository, message, opts);
        },
        createStash(message, includeUntracked) {
            return run(Operation.Stash, () => repository.createStash(message, includeUntracked));
        },
        deleteBranch(name, force) {
            return run(Operation.DeleteBranch, () => repository.deleteBranch(name, force));
        },
        deleteRef(ref) {
            return run(Operation.DeleteRef, () => repository.deleteRef(ref));
        },
        deleteTag(name) {
            return run(Operation.DeleteTag, () => repository.deleteTag(name));
        },
        diff(cached) {
            return run(Operation.Diff, () => repository.diff(cached));
        },
        diffBetween(ref1, ref2, path) {
            return run(Operation.Diff, () => repository.diffBetween(ref1, ref2, path));
        },
        diffBlobs(object1, object2) {
            return run(Operation.Diff, () => repository.diffBlobs(object1, object2));
        },
        diffIndexWith(ref, path) {
            return run(Operation.Diff, () => repository.diffIndexWith(ref, path));
        },
        diffIndexWithHEAD(path) {
            return run(Operation.Diff, () => repository.diffIndexWithHEAD(path));
        },
        diffWith(ref, path) {
            return repository.diffWith(ref, path);
        },
        diffWithHEAD(path) {
            return run(Operation.Diff, () => repository.diffWithHEAD(path));
        },
        dispose() {
            dispose(disposables);
        },
        dropStash(index) {
            return run(Operation.Stash, () => repository.dropStash(index));
        },
        fetch(options) {
            return fetchImpl(repoRoot, run, repository, options);
        },
        fetchAll: throat(1, () => fetchImpl(repoRoot, run, repository, { all: true })),
        fetchDefault: throat(1, (options = {}) => fetchImpl(repoRoot, run, repository, { silent: options.silent })),
        fetchPrune: throat(1, () => fetchImpl(repoRoot, run, repository, { prune: true })),
        findTrackingBranches(upstreamRef) {
            return run(Operation.FindTrackingBranches, () => repository.findTrackingBranches(upstreamRef));
        },
        getBranch(name) {
            return run(Operation.GetBranch, () => repository.getBranch(name));
        },
        getBranches(query) {
            return run(Operation.GetBranches, () => repository.getBranches(query));
        },
        getCommit(ref) {
            return repository.getCommit(ref);
        },
        getCommitTemplate() {
            return run(Operation.GetCommitTemplate, async () => repository.getCommitTemplate());
        },
        getConfig(key) {
            return getConfigImpl(repository, key);
        },
        getConfigs() {
            return getConfigsImpl(run, repository);
        },
        getGlobalConfig(key) {
            return getGlobalConfig(repository, key);
        },
        getInputTemplate() {
            return getInputTemplateImpl(repository);
        },
        getMergeBase(ref1, ref2) {
            return run(Operation.MergeBase, () => repository.getMergeBase(ref1, ref2));
        },
        getObjectDetails(ref, filePath) {
            return run(Operation.GetObjectDetails, () => repository.getObjectDetails(ref, filePath));
        },
        getStashes() {
            return repository.getStashes();
        },
        hashObject(data) {
            return run(Operation.HashObject, () => repository.hashObject(data));
        },
        get headLabel() {
            return headLabelImpl(
                HEAD.get(),
                refs.get(),
                workingTreeGroup,
                untrackedGroup,
                indexGroup,
                mergeGroup,
            );
        },
        get headShortName() {
            return headShortName();
        },
        ignore(files) {
            return ignoreImpl(run, repository, files);
        },
        indexGroup,
        inputBox: sourceControl.inputBox,
        log(options) {
            return run(Operation.Log, () => repository.log(options));
        },
        logFile(uri, options) {
            // TODO: This probably needs per-uri granularity
            return run(Operation.LogFile, () => repository.logFile(uri, options));
        },
        merge(ref) {
            return run(Operation.Merge, () => repository.merge(ref));
        },
        mergeGroup,
        move(from, to) {
            return run(Operation.Move, () => repository.move(from, to));
        },
        onDidChangeOperations,
        onDidChangeOriginalResource,
        onDidChangeRepository,
        onDidChangeState,
        onDidChangeStatus,
        onDidRunGitStatus: onDidChangeStatus,
        onDidRunOperation,
        operations,
        popStash(index) {
            return run(Operation.Stash, () => repository.popStash(index));
        },
        pull(head, unshallow) {
            return pullImpl(run, repoRoot, repository, HEAD.get(), workingTreeGroup, head, unshallow);
        },
        pullFrom(rebase, remote, branch, unshallow) {
            return pullFromImpl(
                run,
                repoRoot,
                repository,
                HEAD.get(),
                workingTreeGroup,
                rebase,
                remote,
                branch,
                unshallow,
            );
        },
        pullWithRebase(head) {
            return pullWithRebaseImpl(run, repoRoot, repository, workingTreeGroup, HEAD.get(), head);
        },
        push(head, forcePushMode) {
            return pushImpl(run, repository, finalRepository, pushErrorHandlerRegistry, head, forcePushMode);
        },
        pushFollowTags(remote, forcePushMode) {
            return run(
                Operation.Push,
                () =>
                    pushInternal(
                        repository,
                        finalRepository,
                        pushErrorHandlerRegistry,
                        remote,
                        undefined,
                        false,
                        true,
                        forcePushMode,
                    ),
            );
        },
        pushTags(remote, forcePushMode) {
            return run(
                Operation.Push,
                () =>
                    pushInternal(
                        repository,
                        finalRepository,
                        pushErrorHandlerRegistry,
                        remote,
                        undefined,
                        false,
                        false,
                        forcePushMode,
                        true,
                    ),
            );
        },
        pushTo(remote, name, setUpstream = false, forcePushMode) {
            return run(
                Operation.Push,
                () =>
                    pushInternal(
                        repository,
                        finalRepository,
                        pushErrorHandlerRegistry,
                        remote,
                        name,
                        setUpstream,
                        undefined,
                        forcePushMode,
                    ),
            );
        },
        rebase(branch) {
            return run(Operation.Rebase, () => repository.rebase(branch));
        },
        rebaseAbort() {
            return run(Operation.RebaseAbort, async () => repository.rebaseAbort());
        },
        get rebaseCommit() {
            return rebaseCommit.get();
        },
        get refs() {
            return refs.get();
        },
        get remotes() {
            return remotes.get();
        },
        removeRemote(name) {
            return run(Operation.Remote, () => repository.removeRemote(name));
        },
        renameBranch(name) {
            return run(Operation.RenameBranch, () => repository.renameBranch(name));
        },
        renameRemote(name, newName) {
            return run(Operation.Remote, () => repository.renameRemote(name, newName));
        },
        reset(treeish, hard) {
            return run(Operation.Reset, () => repository.reset(treeish, hard));
        },
        revert(resources) {
            return run(Operation.RevertFiles, () => repository.revert("HEAD", resources.map(r => r.fsPath)));
        },
        rm(resources) {
            return run(Operation.Remove, () => repository.rm(resources.map(r => r.fsPath)));
        },
        root: repoRoot,
        setBranchUpstream(name, upstream) {
            return run(Operation.SetBranchUpstream, () => repository.setBranchUpstream(name, upstream));
        },
        setConfig(key, value) {
            return run(Operation.Config, () => repository.config("local", key, value));
        },
        show,
        sourceControl,
        stage(resource, contents) {
            return stageImpl(repository, run, onDidChangeOriginalResourceEmitter, resource, contents);
        },
        status,
        get submodules() {
            return submodules.get();
        },
        sync(head) {
            return syncImpl(
                run,
                repoRoot,
                workingTreeGroup,
                repository,
                HEAD.get(),
                remotes.get(),
                finalRepository,
                pushErrorHandlerRegistry,
                head,
            );
        },
        get syncLabel() {
            return syncLabelImpl(HEAD.get(), remotes.get());
        },
        syncRebase: throat(
            1,
            (head: Branch) =>
                syncInternal(
                    run,
                    repoRoot,
                    workingTreeGroup,
                    repository,
                    HEAD.get(),
                    remotes.get(),
                    finalRepository,
                    pushErrorHandlerRegistry,
                    head,
                    true,
                ),
        ),
        get syncTooltip() {
            return syncTooltipImpl(HEAD.get(), remotes.get());
        },
        tag(name, message) {
            return run(Operation.Tag, () => repository.tag(name, message));
        },
        untrackedGroup,
        whenIdleAndFocused,
        workingTreeGroup,
    };

    // Don't allow auto-fetch in untrusted workspaces
    if (workspace.isTrusted) {
        disposables.push(new AutoFetcher(finalRepository, globalState));
    } else {
        const trustDisposable = workspace.onDidGrantWorkspaceTrust(() => {
            trustDisposable.dispose();
            disposables.push(new AutoFetcher(finalRepository, globalState));
        });
        disposables.push(trustDisposable);
    }

    // https://github.com/microsoft/vscode/issues/39039
    const onSuccessfulPush = filterEvent(onDidRunOperation, e => e.operation === Operation.Push && !e.error);
    onSuccessfulPush(
        () => {
            const gitConfig = workspace.getConfiguration("git");

            if (gitConfig.get<boolean>("showPushSuccessNotification")) {
                window.showInformationMessage(localize("push success", "Successfully pushed."));
            }
        },
        null,
        disposables,
    );

    // TODO Yikes! `this` refers to a class under construction
    const statusBar = new StatusBarCommands(finalRepository, remoteSourceProviderRegistry);
    disposables.push(statusBar);
    statusBar.onDidChange(() => sourceControl.statusBarCommands = statusBar.commands, null, disposables);
    sourceControl.statusBarCommands = statusBar.commands;

    const progressManager = new ProgressManager(finalRepository);
    disposables.push(progressManager);

    const onDidChangeCountBadge = filterEvent(
        workspace.onDidChangeConfiguration,
        e => e.affectsConfiguration("git.countBadge", rootUri),
    );
    onDidChangeCountBadge(setCountBadge, null, disposables);
    setCountBadge();

    return finalRepository;
}
