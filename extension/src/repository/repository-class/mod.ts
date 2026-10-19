import { join } from "node:path";
import { setTimeout as timeout } from "node:timers/promises";
import {
    Disposable,
    EventEmitter,
    type Memento,
    type OutputChannel,
    type QuickDiffProvider,
    Uri,
    window,
    workspace,
} from "vscode";
import { type Branch, GitErrorCodes, type Remote } from "../../api/git.js";
import { AutoFetcher } from "../../autofetch.js";
import type { Repository as BaseRepository } from "../../git.js";
import { GitError } from "../../git/error.js";
import type { Submodule } from "../../git/Submodule.js";
import * as i18n from "../../i18n/mod.js";
import { StatusBarCommands } from "../../statusbar.js";
import { create as createSourceControlUI } from "../../ui/source-control.js";
import { toGitUri } from "../../uri.js";
import { createBox } from "../../util/box.js";
import { createCachedLookup } from "../../util/cached-lookup.js";
import { coalesce } from "../../util/coalesce.js";
import * as config from "../../util/config.js";
import { dispose } from "../../util/disposals.js";
import { anyEvent, eventToPromise, filterEvent } from "../../util/events.js";
import { createScheduler } from "../../util/scheduler.js";
import { createDotGitWatcher } from "../../watch/dot-git-watcher.js";
import { createWorkingTreeWatcher } from "../../watch/working-tree-watcher.js";
import { FileEventLogger } from "../FileEventLogger.js";
import { HeadState, type HeadStateOptions } from "../HeadState.js";
import type { OperationResult } from "../OperationResult.js";
import { causesLargeWorkingTreeChanges, isReadOnly, Operation, type OperationOptions } from "../Operations.js";
import { OperationsImpl } from "../Operations.js";
import { ProgressManager } from "../ProgressManager.js";
import { RepositoryState, type RepositoryStateOptions } from "../RepositoryState.js";
import { retryRun } from "../retryRun.js";
import type { AbstractRepository } from "./AbstractRepository.js";
import { buffer as bufferImpl } from "./buffer.js";
import { checkIfMaybeRebased } from "./check-if-maybe-rebased.js";
import { checkIgnore as checkIgnoreImpl } from "./check-ignore.js";
import { clean as cleanImpl } from "./clean.js";
import { commit as commitImpl } from "./commit.js";
import { createRebaseCommitBox } from "./createRebaseCommitBox.js";
import { createStateBox } from "./createStateBox.js";
import { fetch as fetchImpl } from "./fetch.js";
import { createInputTemplate } from "./get-input-template.js";
import { headLabel as headLabelImpl } from "./head-label.js";
import { ignore as ignoreImpl } from "./ignore.js";
import { AbstractRepositorySymbol } from "./isAbstractRepository.js";
import { pullFrom as pullFromImpl } from "./pull-from.js";
import { pullWithRebase as pullWithRebaseImpl } from "./pull-with-rebase.js";
import { pull as pullImpl } from "./pull.js";
import { pushInternal } from "./push-internal.js";
import { push as pushImpl } from "./push.js";
import { stage as stageImpl } from "./stage.js";
import { syncInternal } from "./sync-internal.js";
import { syncLabel as syncLabelImpl } from "./sync-label.js";
import { syncTooltip as syncTooltipImpl } from "./sync-tooltip.js";
import { withSyncCancellation } from "./sync.js";
import { updateModelState as updateModelStateImpl } from "./update-model-state.js";

export function createRepository(
    repository: BaseRepository,
    globalState: Memento,
    outputChannel: OutputChannel,
): AbstractRepository {
    const disposables: Disposable[] = [];
    const repoRoot = repository.root;
    const dotGit = repository.dotGit;

    const workingTreeWatcher = createWorkingTreeWatcher(repoRoot, dotGit, outputChannel);
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

    const onDidChangeStateEmitter = new EventEmitter<RepositoryStateOptions>();
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

    const HEAD = createBox<Branch | undefined>(undefined);
    /** Only set while HEAD is detached on a commit some tag points at. */
    const headTagName = createBox<string | undefined>(undefined);
    const remotes = createBox<Remote[]>([]);

    const rootUri = Uri.file(repository.root);

    const quickDiffProvider: QuickDiffProvider = {
        provideOriginalResource(uri) {
            if (uri.scheme !== "file") {
                return;
            }

            const path = uri.path;

            if (sourceControlUI.mergeGroup.resourceStates.get().some(r => r.state.resourceUri.path === path)) {
                return undefined;
            }

            return toGitUri(uri, "", { replaceFileExtension: true });
        },
    };

    const sourceControlUI = createSourceControlUI(repoRoot, quickDiffProvider);
    disposables.push(sourceControlUI);

    const state = createStateBox(
        onDidChangeStateEmitter,
        HEAD,
        headTagName,
        remotes,
        sourceControlUI,
    );

    const onRunOperationEmitter = new EventEmitter<OperationOptions>();
    const onRunOperation = onRunOperationEmitter.event;

    const submodules = createBox<Submodule[]>([]);
    const rebaseCommit = createRebaseCommitBox(sourceControlUI);

    // TODO UI logic should handle this
    function setCountBadge(): void {
        const countBadge = config.countBadge(Uri.file(repository.root));

        if (countBadge === "off") {
            sourceControlUI.sourceControl.count = 0;
            return;
        }

        // Note: The view fades a changed list before updating it a moment later; the count updates immediately.
        sourceControlUI.sourceControl.count = sourceControlUI.mergeGroup.latestResourceStates().length
            + sourceControlUI.stagedGroup.latestResourceStates().length
            + sourceControlUI.trackedGroup.latestResourceStates().length
            + sourceControlUI.untrackedGroup.latestResourceStates().length;
    }

    const onDidChangeStatusEmitter = new EventEmitter<void>();
    const onDidChangeStatus = onDidChangeStatusEmitter.event;

    const inputTemplate = createInputTemplate(repository);
    const remotesLookup = createCachedLookup(() => repository.getRemotes());
    function invalidateConfigLookups(): void {
        inputTemplate.invalidate();
        remotesLookup.invalidate();
    }
    // Other config sources and the template file go unwatched; a deliberate refresh covers them.
    onDotGitFileChange(
        uri => {
            if (uri.fsPath === join(dotGit, "config")) {
                invalidateConfigLookups();
            }
        },
        null,
        disposables,
    );

    const updateModelState = coalesce(async () => {
        return updateModelStateImpl(
            repository,
            HEAD,
            headTagName,
            remotes,
            submodules,
            rebaseCommit,
            repoRoot,
            setCountBadge,
            onDidChangeStatusEmitter,
            sourceControlUI,
            inputTemplate.get,
            remotesLookup.get,
        );
    });

    async function run<T>(
        operation: OperationOptions,
        runOperation: () => Promise<T> = (): Promise<T> => Promise.resolve<any>(null),
    ): Promise<T> {
        if (state.get() !== RepositoryState.Idle) {
            throw new Error("Repository not initialized");
        }

        let error: unknown = null;

        operations.start(operation);
        onRunOperationEmitter.fire(operation);

        try {
            let result: T;
            {
                // The refresh below covers the operation's own changes; resuming waits for the watchers to be ready.
                await using _dotGitSuspend = isReadOnly(operation) ? null : dotGitFileWatcher.suspend();
                await using _workingTreeSuspend = causesLargeWorkingTreeChanges(operation)
                    ? workingTreeWatcher.suspend()
                    : null;
                result = await retryRun(operation, runOperation);
            }

            // Its `.git/config` write may go unreported while the watcher is suspended.
            if (operation === Operation.Remote) {
                invalidateConfigLookups();
            }

            if (operation === Operation.Refresh || !isReadOnly(operation)) {
                await updateModelState();
            }

            return result;
        } catch (err) {
            error = err;

            if (err instanceof GitError && err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
                state.set(RepositoryState.Disposed);
            }

            throw err;
        } finally {
            operations.end(operation);
            onDidRunOperationEmitter.fire({ error, operation });

            // A failed operation may still have changed things, and its file events were suppressed.
            if (error !== null && !isReadOnly(operation) && state.get() === RepositoryState.Idle) {
                requestAutoRefresh();
            }
        }
    }

    const runRefresh = coalesce(() => run<void>(Operation.Refresh));

    const autoRefreshWhenIdle = coalesce(async () => {
        await whenIdleAndFocused();
        await runRefresh();
        const cooldown = config.autoRefreshCooldown();
        if (cooldown > 0) {
            await timeout(cooldown);
        }
    });
    let pendingAutoRefresh: ReturnType<typeof setTimeout> | undefined;
    function scheduleAutoRefresh(): void {
        clearTimeout(pendingAutoRefresh);
        pendingAutoRefresh = setTimeout(autoRefreshWhenIdle, config.autoRefreshDebounce());
    }

    function requestAutoRefresh(): void {
        const autorefresh = config.autoRefresh();

        if (!autorefresh) {
            return;
        }

        if (isRepositoryHuge.get()) {
            return;
        }

        if (!operations.isIdle()) {
            return;
        }

        scheduleAutoRefresh();
    }

    onFileChange(requestAutoRefresh, null, disposables);

    const onDidChangeRepositoryEmitter = new EventEmitter<Uri>();
    const onDidChangeRepository = onDidChangeRepositoryEmitter.event;

    // Relevate repository changes should trigger virtual document change events
    onDotGitFileChange(onDidChangeRepositoryEmitter.fire, onDidChangeRepositoryEmitter, disposables);

    disposables.push(new FileEventLogger(onWorkingTreeFileChange, onDotGitFileChange, outputChannel));

    function headShortName(): string | undefined {
        const valueHEAD = HEAD.get();
        if (!valueHEAD) {
            return;
        }

        if (valueHEAD.name) {
            return valueHEAD.name;
        }

        const tagName = headTagName.get();

        if (tagName) {
            return tagName;
        }

        return (valueHEAD.commit || "").substring(0, 8);
    }

    function headState(): HeadStateOptions {
        // A rebase detaches HEAD, so it has to be tested for first.
        if (rebaseCommit.get() !== undefined) {
            return HeadState.Rebasing;
        }

        return HEAD.get()?.name === undefined ? HeadState.Detached : HeadState.Attached;
    }

    function updateInputBoxPlaceholder(): void {
        const branchName = headShortName();
        sourceControlUI.sourceControl.inputBox.placeholder = i18n.Translations.commitMessageForCommand(branchName);
    }

    updateInputBoxPlaceholder();
    disposables.push(onDidChangeStatus(() => updateInputBoxPlaceholder()));

    filterEvent(
        workspace.onDidChangeConfiguration,
        e => config.ignoreSubmodules.affected(e, rootUri)
            || config.openDiffOnClick.affected(e, rootUri),
    )(updateModelState, null, disposables);

    const updateInputBoxVisibility = (): void => {
        sourceControlUI.sourceControl.inputBox.visible = config.showCommitInput(rootUri);
    };

    const onConfigListenerForInputBoxVisibility = filterEvent(
        workspace.onDidChangeConfiguration,
        e => config.showCommitInput.affected(e, rootUri),
    );
    onConfigListenerForInputBoxVisibility(updateInputBoxVisibility, null, disposables);
    updateInputBoxVisibility();

    function buffer(ref: string, filePath: string): Promise<Buffer> {
        return bufferImpl(run, repository, ref, filePath);
    }

    const onDidChangeOperations = anyEvent<OperationOptions | OperationResult>(onRunOperation, onDidRunOperation);

    const onDidChangeOriginalResourceEmitter = new EventEmitter<Uri>();
    const onDidChangeOriginalResource = onDidChangeOriginalResourceEmitter.event;

    // Remote operations (fetch, pull, push, sync) run one at a time so they don't contend for git's locks.
    // Repeat requests that are still queued are merged when their key (the operation plus every argument that changes
    // what it does) matches.
    const remoteOperations = createScheduler();
    function scheduleRemote<T>(
        key: readonly unknown[],
        task: (signal: AbortSignal) => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        return remoteOperations.schedule({ key: JSON.stringify(key), signal }, task);
    }
    // Asked before queuing (from the remote refs fetched so far) so the dialog never holds up other remote operations.
    const confirmPullIfMaybeRebased = () => checkIfMaybeRebased(run, repository, HEAD.get()?.name);
    const branchKey = (head: Branch | undefined) => [head?.name, head?.upstream?.remote, head?.upstream?.name];
    const syncScheduled = async (head: Branch, rebase: boolean) => {
        if (!(await confirmPullIfMaybeRebased())) {
            return;
        }
        await withSyncCancellation(repoRoot, signal =>
            scheduleRemote(
                [rebase ? "syncRebase" : "sync", ...branchKey(head)],
                taskSignal =>
                    syncInternal(
                        run,
                        repoRoot,
                        sourceControlUI,
                        repository,
                        HEAD.get(),
                        remotes.get(),
                        finalRepository,
                        head,
                        rebase,
                        taskSignal,
                    ),
                signal,
            ));
    };

    const finalRepository: AbstractRepository = {
        get HEAD() {
            return HEAD.get();
        },
        __type: AbstractRepositorySymbol,
        add(resources, opts) {
            return run(Operation.Add, () => repository.add(resources.map(r => r.fsPath), opts));
        },
        applyStash(index) {
            return run(Operation.Stash, () => repository.applyStash(index));
        },
        autoRefresh: runRefresh,
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
            return cleanImpl(run, sourceControlUI, submodules.get(), repoRoot, repository, resources);
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
        diffIndexWithHEAD(path) {
            return run(Operation.Diff, () => repository.diffIndexWithHEAD(path));
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
            return scheduleRemote(["fetch", options], () => fetchImpl(repoRoot, run, repository, options));
        },
        fetchAll() {
            return scheduleRemote(["fetchAll"], () => fetchImpl(repoRoot, run, repository, { all: true }));
        },
        fetchDefault(options = {}) {
            return scheduleRemote(
                ["fetchDefault", options.silent],
                () => fetchImpl(repoRoot, run, repository, { silent: options.silent }),
            );
        },
        fetchPrune() {
            return scheduleRemote(["fetchPrune"], () => fetchImpl(repoRoot, run, repository, { prune: true }));
        },
        fetchUpstreams(scope, options = {}) {
            return scheduleRemote(
                ["fetchUpstreams", scope, options.silent],
                () => run(Operation.Fetch, () => repository.fetchUpstreams(scope, options)),
            );
        },
        findTrackingBranches(upstreamRef) {
            return run(Operation.FindTrackingBranches, () => repository.findTrackingBranches(upstreamRef));
        },
        getCommit(ref) {
            return repository.getCommit(ref);
        },
        getCommitTemplate() {
            return run(Operation.GetCommitTemplate, async () => repository.getCommitTemplate());
        },
        getInputTemplate() {
            return inputTemplate.get();
        },
        getObjectDetails(ref, filePath) {
            return run(Operation.GetObjectDetails, () => repository.getObjectDetails(ref, filePath));
        },
        getRefs(opts) {
            // Callers get the configured ordering unless they ask for another one.
            return repository.getRefs({ sort: config.branchSortOrder(rootUri), ...opts });
        },
        getStashes() {
            return repository.getStashes();
        },
        get headLabel() {
            return headLabelImpl(
                headShortName(),
                headState(),
                sourceControlUI,
            );
        },
        get headShortName() {
            return headShortName();
        },
        ignore(files) {
            return ignoreImpl(run, repository, files);
        },
        merge(ref) {
            return run(Operation.Merge, () => repository.merge(ref));
        },
        move(from, to) {
            return run(Operation.Move, () => repository.move(from, to));
        },
        onDidChangeOperations,
        onDidChangeOriginalResource,
        onDidChangeRepository,
        onDidChangeState,
        onDidChangeStatus,
        onDidRunOperation,
        operations,
        popStash(index) {
            return run(Operation.Stash, () => repository.popStash(index));
        },
        async pull(head, unshallow) {
            if (!(await confirmPullIfMaybeRebased())) {
                return;
            }
            await scheduleRemote(
                ["pull", ...branchKey(head), unshallow],
                () => pullImpl(run, repoRoot, repository, sourceControlUI, head, unshallow),
            );
        },
        async pullFrom(rebase, remote, branch, unshallow) {
            if (!(await confirmPullIfMaybeRebased())) {
                return;
            }
            await scheduleRemote(["pullFrom", rebase, remote, branch, unshallow], () =>
                pullFromImpl(
                    run,
                    repoRoot,
                    repository,
                    sourceControlUI,
                    rebase,
                    remote,
                    branch,
                    unshallow,
                ));
        },
        async pullWithRebase(head) {
            if (!(await confirmPullIfMaybeRebased())) {
                return;
            }
            await scheduleRemote(
                ["pullWithRebase", ...branchKey(head)],
                () => pullWithRebaseImpl(run, repoRoot, repository, sourceControlUI, head),
            );
        },
        push(head, forcePushMode) {
            return scheduleRemote(
                ["push", ...branchKey(head), forcePushMode],
                () => pushImpl(run, repository, finalRepository, head, forcePushMode),
            );
        },
        pushFollowTags(remote, forcePushMode) {
            return scheduleRemote(["pushFollowTags", remote, forcePushMode], () =>
                run(
                    Operation.Push,
                    () =>
                        pushInternal(
                            repository,
                            finalRepository,
                            remote,
                            undefined,
                            false,
                            true,
                            forcePushMode,
                        ),
                ));
        },
        pushTags(remote, forcePushMode) {
            return scheduleRemote(["pushTags", remote, forcePushMode], () =>
                run(
                    Operation.Push,
                    () =>
                        pushInternal(
                            repository,
                            finalRepository,
                            remote,
                            undefined,
                            false,
                            false,
                            forcePushMode,
                            true,
                        ),
                ));
        },
        pushTo(remote, name, setUpstream = false, forcePushMode) {
            return scheduleRemote(["pushTo", remote, name, setUpstream, forcePushMode], () =>
                run(
                    Operation.Push,
                    () =>
                        pushInternal(
                            repository,
                            finalRepository,
                            remote,
                            name,
                            setUpstream,
                            undefined,
                            forcePushMode,
                        ),
                ));
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
        refresh() {
            invalidateConfigLookups();
            return runRefresh();
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
        sourceControlUI,
        stage(resource, contents) {
            return stageImpl(repository, run, onDidChangeOriginalResourceEmitter, resource, contents);
        },
        get submodules() {
            return submodules.get();
        },
        sync(head) {
            return syncScheduled(head, false);
        },
        get syncLabel() {
            return syncLabelImpl(HEAD.get(), remotes.get());
        },
        syncRebase(head) {
            return syncScheduled(head, true);
        },
        get syncTooltip() {
            return syncTooltipImpl(HEAD.get(), remotes.get());
        },
        tag(name, message) {
            return run(Operation.Tag, () => repository.tag(name, message));
        },
        whenIdleAndFocused,
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
            if (config.showPushSuccessNotification()) {
                window.showInformationMessage(i18n.Translations.pushSuccess());
            }
        },
        null,
        disposables,
    );

    const statusBar = new StatusBarCommands(finalRepository);
    disposables.push(statusBar);
    statusBar.onDidChange(
        () => sourceControlUI.sourceControl.statusBarCommands = statusBar.commands,
        null,
        disposables,
    );
    sourceControlUI.sourceControl.statusBarCommands = statusBar.commands;

    const progressManager = new ProgressManager(finalRepository);
    disposables.push(progressManager);

    const onDidChangeCountBadge = filterEvent(
        workspace.onDidChangeConfiguration,
        e => config.countBadge.affected(e, rootUri),
    );
    onDidChangeCountBadge(setCountBadge, null, disposables);
    setCountBadge();

    return finalRepository;
}
