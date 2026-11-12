/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

import type { Commit } from "monolithic-git-interop/api/commit";
import { emptyTree } from "monolithic-git-interop/api/hash-object/empty-tree";
import { log, logWithSources } from "monolithic-git-interop/api/log/mod";
import { gitLayout } from "monolithic-git-interop/api/rev-parse/git-layout";
import { head } from "monolithic-git-interop/api/rev-parse/head";
import { unwrapOk } from "monolithic-git-interop/errors";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import {
    CancellationError,
    type CancellationToken,
    Disposable,
    EventEmitter,
    FileSystemError,
    FileType,
    MarkdownString,
    ThemeIcon,
    type Timeline,
    type TimelineOptions,
    type TimelineProvider,
    Uri,
    workspace,
    type WorkspaceTimelineProvider,
} from "vscode";
import { Status } from "../api/git.js";
import { makeCommandId } from "../commands/helpers.js";
import type { Git } from "../git.js";
import { sanitizePath } from "../git/helpers.js";
import * as i18n from "../i18n/mod.js";
import type { Model } from "../model.js";
import { debounce } from "../package-patches/just-debounce.js";
import { isReadOnly } from "../repository/Operations.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import { error } from "../tracing.js";
import { fromGitUri, toGitUri } from "../uri.js";
import * as config from "../util/config.js";
import { isDescendant, pathEquals } from "../util/paths.js";
import { throttle } from "../util/throttle.js";
import { clearCompareSelection, compareSelection } from "./compare-selection.js";
import { createEmojifier } from "./emoji.js";
import { contextFor } from "./git-context.js";
import { GitTimelineItem, resolveOpenDiff } from "./item.js";
import {
    getFileTimelinePage,
    orderedTimestamp,
    parseFileCursor,
    readStableHistory,
    remainingLiveOffset,
} from "./paging.js";
import {
    groupWorkspaceHistories,
    parseWorkspaceCursor,
    readWorkspaceTimelinePage,
    usesWorktreeRelativeHistory,
    validateWorkspaceRepositories,
    workspaceRepository,
    type WorkspaceSnapshot,
} from "./workspace-paging.js";

const PROVIDER_ID = "gitm-history";
const PAGE_SIZE = 50;

export function createTimelineProvider(model: Model, git: Git, extensionUri: Uri): Disposable {
    const fileChanged = new EventEmitter<Uri | Uri[] | undefined>();
    const workspaceChanged = new EventEmitter<void>();
    const shutdown = new AbortController();
    const subscriptions = new Map<AbstractRepository, Disposable>();
    const repositoryInstances = new WeakMap<AbstractRepository, string>();
    const operationDates = new Map<AbstractRepository, number>();
    const repositoryTips = new Map<AbstractRepository, string | undefined>();
    const emptyTrees = new Map<string, string>();
    const disposables: Disposable[] = [fileChanged, workspaceChanged];
    const emojify = createEmojifier(extensionUri);
    let registered = false;

    const fireChanged = debounce(() => {
        if (!shutdown.signal.aborted) fileChanged.fire(undefined);
    }, 500);
    const fireWorkspaceChanged = debounce(() => {
        if (!shutdown.signal.aborted) workspaceChanged.fire();
    }, 500);

    async function tree(repository: AbstractRepository, signal: AbortSignal): Promise<string> {
        const cached = emptyTrees.get(repository.root);
        if (cached) return cached;
        const hash = unwrapOk(await emptyTree(contextFor(git, "hash-object"), repository.root, signal));
        emptyTrees.set(repository.root, hash);
        return hash;
    }

    function timestamp(commit: Commit, repository: AbstractRepository): number {
        return (config.timelineDate(Uri.file(repository.root)) === "authored" ? commit.authorDate : commit.commitDate)
            .getTime();
    }

    function repositoryInstance(repository: AbstractRepository): string {
        const instance = repositoryInstances.get(repository);
        if (!instance) throw new Error("Workspace Timeline repository is not registered");
        return instance;
    }

    async function item(
        repository: AbstractRepository,
        commit: Commit,
        contextValue: string,
        previousRef: string,
        previousUri: Uri | undefined,
        date: number,
        orderDate: number,
        showRepository = false,
    ): Promise<GitTimelineItem> {
        const rootUri = Uri.file(repository.root);
        const message = await emojify(commit.message);
        const adjusted = date !== orderDate;
        const result = new GitTimelineItem(
            commit.hash,
            previousRef,
            message,
            orderDate,
            commit.hash,
            contextValue,
            rootUri,
            previousUri,
        );
        result.iconPath = new ThemeIcon("git-commit");
        result.description = [
            showRepository ? path.basename(repository.root) : undefined,
            config.timelineShowAuthor(rootUri) ? commit.authorName : undefined,
            adjusted ? i18n.Translations.timelineDateAdjusted() : undefined,
        ].filter(value => value !== undefined).join(" • ");
        const hover = new MarkdownString("", true);
        hover.appendMarkdown("$(account) **");
        hover.appendText(commit.authorName);
        hover.appendMarkdown("**\n\n");
        hover.appendText(`${commit.authorEmail}\n${new Date(date).toLocaleString()}\n${commit.hash}\n\n${message}`);
        if (commit.shortStat) {
            hover.appendMarkdown("\n\n---\n\n");
            hover.appendText(i18n.Translations.timelineStats(
                commit.shortStat.files,
                commit.shortStat.insertions,
                commit.shortStat.deletions,
            ));
        }
        if (adjusted) {
            hover.appendMarkdown("\n\n---\n\n");
            hover.appendText(i18n.Translations.timelineDateOrderExplanation(
                commit.authorDate.toLocaleString(),
                commit.commitDate.toLocaleString(),
            ));
        }
        result.tooltip = hover;
        return result;
    }

    async function request(
        token: CancellationToken,
        work: (signal: AbortSignal) => Promise<Timeline>,
    ): Promise<Timeline> {
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() => controller.abort());
        if (token.isCancellationRequested) controller.abort();
        const signal = AbortSignal.any([controller.signal, shutdown.signal]);
        try {
            if (signal.aborted) throw new CancellationError();
            const result = await work(signal);
            if (signal.aborted) throw new CancellationError();
            return result;
        } catch (ex) {
            if (signal.aborted) throw new CancellationError();
            error(`Loading Git Timeline failed; ex=${inspect(ex)}`);
            throw ex;
        } finally {
            controller.abort();
            cancellation.dispose();
        }
    }

    function limitFor(options: TimelineOptions): number {
        const limit = options.limit ?? PAGE_SIZE;
        if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid Timeline page size");
        return limit;
    }

    const provider: TimelineProvider & WorkspaceTimelineProvider = {
        onDidChangeTimeline: fileChanged.event,
        onDidChangeWorkspaceTimeline: workspaceChanged.event,
        provideTimeline: (uri, options, token) =>
            request(token, async signal => {
                const repository = model.getRepository(uri);
                if (!repository) return { items: [] };
                const fileUri = uri.scheme === "gitm" ? Uri.file(fromGitUri(uri).path) : uri;
                let folder: boolean;
                try {
                    folder = ((await workspace.fs.stat(fileUri)).type & FileType.Directory) !== 0;
                } catch (ex) {
                    if (!(ex instanceof FileSystemError) || ex.code !== "FileNotFound") throw ex;
                    folder = false;
                }
                const limit = limitFor(options);
                const cursor = options.cursor ? parseFileCursor(options.cursor) : undefined;
                const live = !folder && (!cursor || cursor.liveOffset !== undefined);
                // Rendered groups can lag status while their layout settles.
                const groups = repository.sourceControlUI;
                const staged = live
                    ? groups.stagedGroup.latestResourceStates().find(resource =>
                        pathEquals(resource.resourceUri.fsPath, fileUri.fsPath)
                    )
                    : undefined;
                const working = live
                    ? [...groups.trackedGroup.latestResourceStates(), ...groups.untrackedGroup.latestResourceStates()]
                        .find(resource => pathEquals(resource.resourceUri.fsPath, fileUri.fsPath))
                    : undefined;
                // A staged rename has no committed history under its new name.
                const logPath = cursor ? path.resolve(repository.root, cursor.path) : staged?.state.original.fsPath
                    ?? fileUri.fsPath;
                if (!isDescendant(repository.root, logPath)) {
                    throw new Error("Timeline cursor is outside its repository");
                }
                const headCommit = repository.HEAD?.commit;
                const initialTip = !cursor && headCommit && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(headCommit)
                    ? headCommit
                    : cursor?.hash;
                const skip = cursor?.skip ?? 0;
                const { tip, commits } = await readStableHistory(
                    initialTip,
                    async hash =>
                        unwrapOk(
                            await log(contextFor(git, "log"), repository.root, {
                                path: `:(literal)${sanitizePath(logPath)}`,
                                hash,
                                skip: folder ? skip || undefined : undefined,
                                discard: folder ? undefined : skip || undefined,
                                maxEntries: limit + 1,
                                topoOrder: true,
                                follow: !folder,
                                filePaths: !folder,
                                shortStats: true,
                                signal,
                            }),
                        ),
                    async () => unwrapOk(await head(contextFor(git, "rev-parse"), repository.root, signal)),
                );
                const liveItems: GitTimelineItem[] = [];
                if (live) {
                    const head = repository.HEAD?.commit ? "HEAD" : await tree(repository, signal);
                    if (staged) {
                        const entry = new GitTimelineItem(
                            "~",
                            head,
                            i18n.Translations.stagedChanges(),
                            operationDates.get(repository) ?? Date.now(),
                            "index",
                            "gitm:file:index",
                            Uri.file(repository.root),
                            toGitUri(staged.state.original, head),
                        );
                        entry.iconPath = new ThemeIcon("git-commit");
                        entry.tooltip = `${i18n.Translations.timelineYou()}\n${staged.decorations.tooltip ?? ""}`;
                        // Unlike "~", an empty ref reads the index without consulting rendered resource groups.
                        entry.resourceUri = toGitUri(fileUri, "");
                        entry.command = resolveOpenDiff(entry, fileUri);
                        liveItems.unshift(entry);
                    }
                    if (working && config.timelineShowUncommitted(Uri.file(repository.root))) {
                        const previousRef = staged ? "~" : head;
                        const resourceUri = working.state.type === Status.DELETED
                            ? toGitUri(fileUri, await tree(repository, signal))
                            : fileUri;
                        const entry = new GitTimelineItem(
                            "",
                            previousRef,
                            i18n.Translations.timelineUncommittedChanges(),
                            Date.now(),
                            "working",
                            "gitm:file:working",
                            Uri.file(repository.root),
                            toGitUri(staged ? fileUri : working.state.original, staged ? "" : head),
                        );
                        entry.iconPath = new ThemeIcon("circle-outline");
                        entry.tooltip = `${i18n.Translations.timelineYou()}\n${working.decorations.tooltip ?? ""}`;
                        entry.resourceUri = resourceUri;
                        entry.command = resolveOpenDiff(entry, fileUri);
                        liveItems.unshift(entry);
                    }
                }
                const liveOffset = remainingLiveOffset(liveItems, cursor?.liveOffset);
                const page = getFileTimelinePage(commits, limit, liveItems.length, liveOffset);
                const items = liveItems.slice(liveOffset, liveOffset + page.liveCount);
                let before = cursor?.before;
                for (const entry of items) {
                    const date = entry.timestamp;
                    const orderDate = orderedTimestamp(date, before);
                    if (date !== orderDate) {
                        entry.description = i18n.Translations.timelineDateAdjusted();
                        const origTooltip = entry.tooltip;
                        const orderExplanation = i18n.Translations.timelineLiveDateOrderExplanation(
                            new Date(date).toLocaleString(),
                        );
                        if (origTooltip == null) {
                            entry.tooltip = orderExplanation;
                        } else if (origTooltip instanceof MarkdownString) {
                            entry.tooltip = origTooltip.appendMarkdown(`\n\n${orderExplanation}`);
                        } else {
                            entry.tooltip = `${origTooltip ?? ""}\n\n${orderExplanation}`;
                        }
                    }
                    entry.timestamp = orderDate;
                    before = orderDate;
                }
                for (const [index, commit] of commits.slice(0, page.commitCount).entries()) {
                    const next = commits[index + 1];
                    const previousRef = folder
                        ? commit.parents[0] ?? await tree(repository, signal)
                        : next?.hash ?? await tree(repository, signal);
                    const previousPath = next?.filePath ? Uri.file(path.join(repository.root, next.filePath)) : fileUri;
                    const date = timestamp(commit, repository);
                    const orderDate = orderedTimestamp(date, before);
                    const entry = await item(
                        repository,
                        commit,
                        folder ? "gitm:folder:commit" : "gitm:file:commit",
                        previousRef,
                        folder ? undefined : toGitUri(previousPath, previousRef),
                        date,
                        orderDate,
                    );
                    if (folder) {
                        entry.command = {
                            command: makeCommandId("timelineViewCommit"),
                            title: i18n.Translations.openCommit(),
                            arguments: [entry, uri, PROVIDER_ID],
                        };
                    } else {
                        const commitPath = commit.filePath
                            ? Uri.file(path.join(repository.root, commit.filePath))
                            : fileUri;
                        entry.resourceUri = toGitUri(commitPath, commit.hash);
                        entry.command = resolveOpenDiff(entry, fileUri);
                    }
                    items.push(entry);
                    before = orderDate;
                }
                return {
                    items,
                    cursor: (commits[page.commitCount] || page.nextLiveOffset !== undefined) && before !== undefined
                        ? JSON.stringify({
                            hash: tip,
                            path: logPath,
                            skip: skip + page.commitCount,
                            before,
                            liveOffset: page.nextLiveOffset,
                        })
                        : undefined,
                };
            }),
        provideWorkspaceTimeline: (options, token) =>
            request(token, async signal => {
                const cursor = options.cursor ? parseWorkspaceCursor(options.cursor) : undefined;
                const limit = limitFor(options);
                let histories = cursor?.histories;
                if (!histories) {
                    const isolateWorktrees = usesWorktreeRelativeHistory({ ...process.env, ...git.env });
                    const snapshot = throttle(4, async (repository: AbstractRepository): Promise<
                        WorkspaceSnapshot | undefined
                    > => {
                        signal.throwIfAborted();
                        const current = repository.HEAD?.commit;
                        const knownTip = current && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(current)
                            ? current
                            : undefined;
                        const tip = knownTip ?? (await readStableHistory(
                            undefined,
                            async hash =>
                                unwrapOk(
                                    await log(contextFor(git, "log"), repository.root, {
                                        hash,
                                        maxEntries: 1,
                                        signal,
                                    }),
                                ),
                            async () => unwrapOk(await head(contextFor(git, "rev-parse"), repository.root, signal)),
                        )).tip;
                        if (!tip) return undefined;
                        const layout = unwrapOk(
                            await gitLayout(
                                contextFor(git, "rev-parse"),
                                repository.root,
                                signal,
                            ),
                        );
                        const [commonDir, objectsDir] = await Promise.all([
                            realpath(layout.commonDir),
                            realpath(layout.objectsDir),
                        ]);
                        return {
                            root: repository.root,
                            tip,
                            commonDir,
                            objectsDir,
                            ...(isolateWorktrees ? { isolationRoot: repository.root } : {}),
                            instance: repositoryInstance(repository),
                        };
                    });
                    const revisions = await Promise.all(model.repositories.map(repository => snapshot(repository)));
                    histories = groupWorkspaceHistories(revisions.filter(revision => revision !== undefined));
                }
                const repositories = new Map(model.repositories.map(repository => [repository.root, repository]));
                const instances = (active: ReadonlyMap<string, AbstractRepository>): Map<string, string> =>
                    new Map([...active].map(([root, repository]) => [root, repositoryInstance(repository)]));
                validateWorkspaceRepositories(histories, instances(repositories));
                const repositoryAt = (root: string): AbstractRepository => {
                    const repository = repositories.get(root);
                    if (!repository) throw new Error("Workspace Timeline repository was closed; refresh the history");
                    return repository;
                };
                const { page, histories: next } = await readWorkspaceTimelinePage(
                    histories,
                    limit,
                    async (history, maxEntries) => {
                        signal.throwIfAborted();
                        const root = history.repositories[0]?.root;
                        if (!root) throw new Error("Workspace Timeline history has no repository");
                        return unwrapOk(
                            await logWithSources(contextFor(git, "log"), repositoryAt(root).root, {
                                hashes: [...new Set(history.repositories.map(({ tip }) => tip))],
                                maxEntries,
                                skip: history.skip || undefined,
                                signal,
                            }),
                        );
                    },
                    (commit, history) => timestamp(commit, repositoryAt(workspaceRepository(history, commit))),
                );
                const current = new Map(model.repositories.map(repository => [repository.root, repository]));
                validateWorkspaceRepositories(histories, instances(current));
                const items: GitTimelineItem[] = [];
                let before = cursor?.before;
                for (const { history, commit } of page) {
                    const repository = repositoryAt(workspaceRepository(history, commit));
                    const date = timestamp(commit, repository);
                    const orderDate = orderedTimestamp(date, before);
                    const entry = await item(
                        repository,
                        commit,
                        "gitm:workspace:commit",
                        commit.parents[0] ?? await tree(repository, signal),
                        undefined,
                        date,
                        orderDate,
                        repositories.size > 1,
                    );
                    entry.id = JSON.stringify([
                        history.commonDir,
                        history.objectsDir,
                        history.isolationRoot,
                        commit.hash,
                    ]);
                    entry.command = {
                        command: makeCommandId("timelineViewCommit"),
                        title: i18n.Translations.openCommit(),
                        arguments: [entry, undefined, PROVIDER_ID],
                    };
                    items.push(entry);
                    before = orderDate;
                }
                return {
                    items,
                    cursor: next && before !== undefined ? JSON.stringify({ histories: next, before }) : undefined,
                };
            }),
    };

    function register(): void {
        if (registered) return;
        const files = workspace.registerTimelineProvider(
            PROVIDER_ID,
            i18n.Translations.timelineSource(),
            ["file", "gitm", "vscode-remote", "vscode-local-history"],
            provider,
        );
        try {
            const workspaceHistory = workspace.registerWorkspaceTimelineProvider(
                PROVIDER_ID,
                i18n.Translations.timelineSource(),
                provider,
            );
            disposables.push(files, workspaceHistory);
            registered = true;
        } catch (ex) {
            files.dispose();
            throw ex;
        }
    }

    function subscribe(repository: AbstractRepository): void {
        if (subscriptions.has(repository)) return;
        repositoryInstances.set(repository, randomUUID());
        register();
        operationDates.set(repository, Date.now());
        repositoryTips.set(repository, repository.HEAD?.commit);
        subscriptions.set(
            repository,
            Disposable.from(
                repository.onDidChangeStatus(() => {
                    fireChanged();
                    const tip = repository.HEAD?.commit;
                    if (repositoryTips.get(repository) !== tip) {
                        repositoryTips.set(repository, tip);
                        fireWorkspaceChanged();
                    }
                }),
                repository.onDidRunOperation(result => {
                    if (!result.error && !isReadOnly(result.operation)) {
                        operationDates.set(repository, Date.now());
                        fireChanged();
                        fireWorkspaceChanged();
                    }
                }),
            ),
        );
    }
    for (const repository of model.repositories) subscribe(repository);
    clearCompareSelection();
    disposables.push(
        new Disposable(clearCompareSelection),
        model.onDidOpenRepository(repository => {
            subscribe(repository);
            fireChanged();
            fireWorkspaceChanged();
        }),
        model.onDidCloseRepository(repository => {
            subscriptions.get(repository)?.dispose();
            subscriptions.delete(repository);
            operationDates.delete(repository);
            repositoryTips.delete(repository);
            emptyTrees.delete(repository.root);
            const selectedRoot = compareSelection()?.item.rootUri.fsPath;
            if (selectedRoot && pathEquals(selectedRoot, repository.root)) clearCompareSelection();
            fireChanged();
            fireWorkspaceChanged();
        }),
        model.onDidChangeRepository(() => {
            fireChanged();
            fireWorkspaceChanged();
        }),
        workspace.onDidChangeConfiguration(event => {
            if (
                config.timelineDate.affected(event) || config.timelineShowAuthor.affected(event)
                || config.timelineShowUncommitted.affected(event)
            ) {
                fireChanged();
                fireWorkspaceChanged();
            }
        }),
    );
    return new Disposable(() => {
        shutdown.abort();
        for (const subscription of subscriptions.values()) subscription.dispose();
        subscriptions.clear();
        operationDates.clear();
        repositoryTips.clear();
        emptyTrees.clear();
        Disposable.from(...disposables).dispose();
    });
}
