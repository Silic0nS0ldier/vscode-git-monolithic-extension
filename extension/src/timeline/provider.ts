/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

import type { Commit } from "monolithic-git-interop/api/commit";
import { emptyTree } from "monolithic-git-interop/api/hash-object/empty-tree";
import { log } from "monolithic-git-interop/api/log/mod";
import { unwrapOk } from "monolithic-git-interop/errors";
import { randomUUID } from "node:crypto";
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
import { clearCompareSelection, compareSelection } from "./compare-selection.js";
import { createEmojifier } from "./emoji.js";
import { contextFor } from "./git-context.js";
import { GitTimelineItem, resolveOpenDiff } from "./item.js";
import {
    createWorkspaceSessions,
    getFileTimelinePage,
    parseFileCursor,
    parseWorkspaceCursor,
    readWorkspaceTimelinePage,
} from "./paging.js";

const PROVIDER_ID = "gitm-history";
const PAGE_SIZE = 50;

export function createTimelineProvider(model: Model, git: Git, extensionUri: Uri): Disposable {
    const fileChanged = new EventEmitter<Uri | Uri[] | undefined>();
    const workspaceChanged = new EventEmitter<void>();
    const shutdown = new AbortController();
    const subscriptions = new Map<AbstractRepository, Disposable>();
    const operationDates = new Map<AbstractRepository, number>();
    const emptyTrees = new Map<string, string>();
    const workspaceSessions = createWorkspaceSessions(8);
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

    async function item(
        repository: AbstractRepository,
        commit: Commit,
        contextValue: string,
        previousRef: string,
        previousUri?: Uri,
        showRepository = false,
    ): Promise<GitTimelineItem> {
        const rootUri = Uri.file(repository.root);
        const message = await emojify(commit.message);
        const date = timestamp(commit, repository);
        const result = new GitTimelineItem(
            commit.hash,
            previousRef,
            message,
            date,
            commit.hash,
            contextValue,
            rootUri,
            previousUri,
        );
        result.iconPath = new ThemeIcon("git-commit");
        result.description = [
            showRepository ? path.basename(repository.root) : undefined,
            config.timelineShowAuthor(rootUri) ? commit.authorName : undefined,
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
                const live = (!cursor || cursor.liveOffset !== undefined) && !folder;
                // The rendered groups can lag status by the layout-shift delay; live entries follow status.
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
                // A staged rename has no committed history under its new name, so follow it from the original.
                const logPath = cursor ? path.resolve(repository.root, cursor.path) : staged?.state.original.fsPath
                    ?? fileUri.fsPath;
                if (!isDescendant(repository.root, logPath)) {
                    throw new Error("Timeline cursor is outside its repository");
                }
                // History is not linear, so later pages continue from the same tip rather than a commit on one side
                // of a merge.
                const headCommit = repository.HEAD?.commit;
                const tip = !cursor && headCommit && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(headCommit)
                    ? headCommit
                    : cursor?.hash;
                const skip = cursor?.skip ?? 0;
                const fetched = unwrapOk(
                    await log(contextFor(git, "log"), repository.root, {
                        path: `:(literal)${sanitizePath(logPath)}`,
                        hash: tip,
                        // `--skip` counts commits before `--follow` filters them and loses renames it skips past, so
                        // file history re-reads the commits already shown instead.
                        skip: folder && skip ? skip : undefined,
                        maxEntries: (folder ? 0 : skip) + limit + 1,
                        follow: !folder,
                        filePaths: !folder,
                        shortStats: true,
                        signal,
                    }),
                );
                const commits = folder ? fetched : fetched.slice(skip);
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
                        // `~` resolves through the rendered groups, which can lag status; `""` always reads the index.
                        entry.resourceUri = toGitUri(fileUri, "");
                        entry.command = resolveOpenDiff(entry, fileUri);
                        liveItems.unshift(entry);
                    }
                    if (working && config.timelineShowUncommitted(Uri.file(repository.root))) {
                        const previousRef = staged ? "~" : head;
                        // A deleted file has no working version to read, so it is shown as empty.
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
                const page = getFileTimelinePage(commits, limit, liveItems.length, cursor?.liveOffset);
                const liveOffset = cursor?.liveOffset ?? 0;
                const items = liveItems.slice(liveOffset, liveOffset + page.liveCount);
                for (const [index, commit] of commits.slice(0, page.commitCount).entries()) {
                    const next = commits[index + 1];
                    const previousRef = folder
                        ? commit.parents[0] ?? await tree(repository, signal)
                        : next?.hash ?? await tree(repository, signal);
                    const previousPath = next?.filePath ? Uri.file(path.join(repository.root, next.filePath)) : fileUri;
                    const entry = await item(
                        repository,
                        commit,
                        folder ? "gitm:folder:commit" : "gitm:file:commit",
                        previousRef,
                        folder ? undefined : toGitUri(previousPath, previousRef),
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
                }
                return {
                    items,
                    cursor: commits[page.commitCount] || page.nextLiveOffset !== undefined
                        ? JSON.stringify({
                            hash: tip,
                            path: logPath,
                            skip: skip + page.commitCount,
                            liveOffset: page.nextLiveOffset,
                        })
                        : undefined,
                };
            }),
        provideWorkspaceTimeline: (options, token) =>
            request(token, async signal => {
                const cursor = options.cursor ? parseWorkspaceCursor(options.cursor) : undefined;
                const limit = limitFor(options);
                const session = cursor?.session ?? randomUUID();
                const pageNumber = cursor?.page ?? 0;
                const shown = workspaceSessions.open(session, pageNumber);
                const repositories = new Map(model.repositories.map(repository => [repository.root, repository]));
                const repositoryAt = (root: string): AbstractRepository => {
                    const repository = repositories.get(root);
                    if (!repository) throw new Error("Unknown workspace Timeline repository");
                    return repository;
                };
                const skips = cursor?.skips ?? Object.fromEntries(model.repositories.map(({ root }) => [root, 0]));
                const { page, skips: next } = await readWorkspaceTimelinePage(
                    Object.fromEntries(Object.entries(skips).filter(([root]) => repositories.has(root))),
                    limit,
                    async (root, skip, maxEntries) =>
                        unwrapOk(
                            await log(contextFor(git, "log"), root, { maxEntries, skip: skip || undefined, signal }),
                        ),
                    (commit, root) => timestamp(commit, repositoryAt(root)),
                    shown.seen,
                );
                const items = await Promise.all(page.map(async ({ root, commit }) => {
                    const repository = repositoryAt(root);
                    const entry = await item(
                        repository,
                        commit,
                        "gitm:workspace:commit",
                        commit.parents[0] ?? await tree(repository, signal),
                        undefined,
                        model.repositories.length > 1,
                    );
                    entry.command = {
                        command: makeCommandId("timelineViewCommit"),
                        title: i18n.Translations.openCommit(),
                        arguments: [entry, undefined, PROVIDER_ID],
                    };
                    return entry;
                }));
                shown.record(page.map(({ commit }) => commit.hash));
                return {
                    items,
                    cursor: next ? JSON.stringify({ session, page: pageNumber + 1, skips: next }) : undefined,
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
        register();
        operationDates.set(repository, Date.now());
        subscriptions.set(
            repository,
            Disposable.from(
                repository.onDidChangeStatus(() => fireChanged()),
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
            emptyTrees.delete(repository.root);
            if (compareSelection()?.item.rootUri.fsPath === repository.root) clearCompareSelection();
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
        emptyTrees.clear();
        workspaceSessions.clear();
        Disposable.from(...disposables).dispose();
    });
}
