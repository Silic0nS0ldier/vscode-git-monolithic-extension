import { Disposable, EventEmitter, type Memento, type OutputChannel, type QuickDiffProvider, Uri, window, workspace } from "vscode";
import { type Branch, GitErrorCodes, type Ref, RefType, type Remote } from "../../api/git.js";
import { AutoFetcher } from "../../autofetch.js";
import type { Repository as BaseRepository } from "../../git.js";
import { GitError } from "../../git/error.js";
import type { Submodule } from "../../git/Submodule.js";
import * as i18n from "../../i18n/mod.js";
import { debounce } from "../../package-patches/just-debounce.js";
import { throat } from "../../package-patches/throat.js";
import { StatusBarCommands } from "../../statusbar.js";
import { create as createSourceControlUI } from "../../ui/source-control.js";
import { toGitUri } from "../../uri.js";
import { createBox } from "../../util/box.js";
import * as config from "../../util/config.js";
import { dispose } from "../../util/disposals.js";
import { anyEvent, eventToPromise, filterEvent } from "../../util/events.js";
import { timeout } from "../../util/timeout.js";
import { createDotGitWatcher } from "../../watch/dot-git-watcher.js";
import { createWorkingTreeWatcher } from "../../watch/working-tree-watcher.js";
import { FileEventLogger } from "../FileEventLogger.js";
import type { OperationResult } from "../OperationResult.js";
import { isReadOnly, Operation, type OperationOptions } from "../Operations.js";
import { OperationsImpl } from "../Operations.js";
import { ProgressManager } from "../ProgressManager.js";
import { RepositoryState, type RepositoryStateOptions } from "../RepositoryState.js";
import { retryRun } from "../retryRun.js";
import type { AbstractRepository } from "./AbstractRepository.js";
import { buffer as bufferImpl } from "./buffer.js";
import { checkIgnore as checkIgnoreImpl } from "./check-ignore.js";
import { clean as cleanImpl } from "./clean.js";
import { commit as commitImpl } from "./commit.js";
import { createRebaseCommitBox } from "./createRebaseCommitBox.js";
import { createStateBox } from "./createStateBox.js";
import { fetch as fetchImpl } from "./fetch.js";
import { getConfig as getConfigImpl, getConfigs as getConfigsImpl, getGlobalConfig } from "./config.js";
import { getInputTemplate as getInputTemplateImpl } from "./get-input-template.js";
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
import { sync as syncImpl } from "./sync.js";
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
    const refs = createBox<Ref[]>([]);
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
        refs,
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

        // TODO This is getting out of sync, likely due to delayed update (UX)
        sourceControlUI.sourceControl.count = sourceControlUI.mergeGroup.resourceStates.get().length
            + sourceControlUI.stagedGroup.resourceStates.get().length
            + sourceControlUI.trackedGroup.resourceStates.get().length
            + sourceControlUI.untrackedGroup.resourceStates.get().length;
    }

    const onDidChangeStatusEmitter = new EventEmitter<void>();
    const onDidChangeStatus = onDidChangeStatusEmitter.event;

    const updateModelState = throat(1, async () => {
        return updateModelStateImpl(
            repository,
            HEAD,
            refs,
            remotes,
            submodules,
            rebaseCommit,
            repoRoot,
            setCountBadge,
            onDidChangeStatusEmitter,
            sourceControlUI,
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
            const result = await retryRun(operation, runOperation);

            if (operation === Operation.Status || !isReadOnly(operation)) {
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

    function onFileChangeHandler(): void {
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

        eventuallyUpdateWhenIdleAndWait();
    }

    onFileChange(onFileChangeHandler, null, disposables);

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

        const tag = refs.get().filter(iref => iref.type === RefType.Tag && iref.commit === valueHEAD.commit)[0];
        const tagName = tag && tag.name;

        if (tagName) {
            return tagName;
        }

        return (valueHEAD.commit || "").substring(0, 8);
    }

    function updateInputBoxPlaceholder(): void {
        const branchName = headShortName();
        sourceControlUI.sourceControl.inputBox.placeholder = i18n.Translations.commitMessageForCommand(branchName);
    }

    updateInputBoxPlaceholder();
    disposables.push(onDidChangeStatus(() => updateInputBoxPlaceholder()));

    filterEvent(
        workspace.onDidChangeConfiguration,
        e => config.branchSortOrder.affected(e, rootUri)
            || config.ignoreSubmodules.affected(e, rootUri)
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

    const finalRepository: AbstractRepository = {
        get HEAD() {
            return HEAD.get();
        },
        __type: AbstractRepositorySymbol,
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
                sourceControlUI,
            );
        },
        get headShortName() {
            return headShortName();
        },
        ignore(files) {
            return ignoreImpl(run, repository, files);
        },
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
        pull(head, unshallow) {
            return pullImpl(run, repoRoot, repository, HEAD.get(), sourceControlUI, head, unshallow);
        },
        pullFrom(rebase, remote, branch, unshallow) {
            return pullFromImpl(
                run,
                repoRoot,
                repository,
                HEAD.get(),
                sourceControlUI,
                rebase,
                remote,
                branch,
                unshallow,
            );
        },
        pullWithRebase(head) {
            return pullWithRebaseImpl(run, repoRoot, repository, sourceControlUI, HEAD.get(), head);
        },
        push(head, forcePushMode) {
            return pushImpl(run, repository, finalRepository, head, forcePushMode);
        },
        pushFollowTags(remote, forcePushMode) {
            return run(
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
            );
        },
        pushTags(remote, forcePushMode) {
            return run(
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
            );
        },
        pushTo(remote, name, setUpstream = false, forcePushMode) {
            return run(
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
            return run(Operation.Config, () => repository.config(key, value));
        },
        sourceControlUI,
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
                sourceControlUI,
                repository,
                HEAD.get(),
                remotes.get(),
                finalRepository,
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
                    sourceControlUI,
                    repository,
                    HEAD.get(),
                    remotes.get(),
                    finalRepository,
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
