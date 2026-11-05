/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

import type { Commit } from "monolithic-git-interop/api/commit";
import { emptyTree } from "monolithic-git-interop/api/hash-object/empty-tree";
import { log } from "monolithic-git-interop/api/log/mod";
import { unwrapOk } from "monolithic-git-interop/errors";
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
import { makeCommandId } from "../commands/helpers.js";
import type { Git } from "../git.js";
import * as i18n from "../i18n/mod.js";
import type { Model } from "../model.js";
import { debounce } from "../package-patches/just-debounce.js";
import { isReadOnly } from "../repository/Operations.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import { error } from "../tracing.js";
import { fromGitUri, toGitUri } from "../uri.js";
import * as config from "../util/config.js";
import { isDescendant, pathEquals } from "../util/paths.js";
import { createEmojifier } from "./emoji.js";
import { contextFor } from "./git-context.js";
import { GitTimelineItem, resolveOpenDiff } from "./item.js";
import { getFileTimelinePage, getWorkspaceTimelinePage, parseFileCursor, parseWorkspaceCursor } from "./paging.js";

const PROVIDER_ID = "gitm-history";
const PAGE_SIZE = 50;

export function createTimelineProvider(model: Model, git: Git, extensionUri: Uri): Disposable {
    const fileChanged = new EventEmitter<Uri | Uri[] | undefined>();
    const workspaceChanged = new EventEmitter<void>();
    const shutdown = new AbortController();
    const subscriptions = new Map<AbstractRepository, Disposable>();
    const operationDates = new Map<AbstractRepository, number>();
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
                const logPath = cursor ? path.resolve(repository.root, cursor.path) : fileUri.fsPath;
                if (!isDescendant(repository.root, logPath)) {
                    throw new Error("Timeline cursor is outside its repository");
                }
                const commits = unwrapOk(
                    await log(contextFor(git, "log"), repository.root, {
                        path: `:(literal)${logPath}`,
                        hash: cursor?.hash,
                        maxEntries: limit + 1,
                        follow: !folder,
                        filePaths: !folder,
                        shortStats: true,
                        signal,
                    }),
                );
                const liveItems: GitTimelineItem[] = [];
                if ((!cursor || cursor.liveOffset !== undefined) && !folder) {
                    const groups = repository.sourceControlUI;
                    const staged = groups.stagedGroup.resourceStates.get().find(resource =>
                        pathEquals(resource.resourceUri.fsPath, fileUri.fsPath)
                    );
                    const working = [
                        ...groups.trackedGroup.resourceStates.get(),
                        ...groups.untrackedGroup.resourceStates.get(),
                    ]
                        .find(resource => pathEquals(resource.resourceUri.fsPath, fileUri.fsPath));
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
                        entry.resourceUri = toGitUri(fileUri, "~");
                        entry.command = resolveOpenDiff(entry, fileUri);
                        liveItems.unshift(entry);
                    }
                    if (working && config.timelineShowUncommitted(Uri.file(repository.root))) {
                        const previousRef = staged ? "~" : head;
                        const entry = new GitTimelineItem(
                            "",
                            previousRef,
                            i18n.Translations.timelineUncommittedChanges(),
                            Date.now(),
                            "working",
                            "gitm:file:working",
                            Uri.file(repository.root),
                            toGitUri(staged ? fileUri : working.state.original, previousRef),
                        );
                        entry.iconPath = new ThemeIcon("circle-outline");
                        entry.tooltip = `${i18n.Translations.timelineYou()}\n${working.decorations.tooltip ?? ""}`;
                        entry.resourceUri = fileUri;
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
                const next = commits[page.commitCount];
                return {
                    items,
                    cursor: next || page.nextLiveOffset !== undefined
                        ? JSON.stringify({
                            hash: next?.hash,
                            path: next?.filePath ?? logPath,
                            liveOffset: page.nextLiveOffset,
                        })
                        : undefined,
                };
            }),
        provideWorkspaceTimeline: (options, token) =>
            request(token, async signal => {
                const skips = options.cursor ? parseWorkspaceCursor(options.cursor) : undefined;
                const limit = limitFor(options);
                const repositories = model.repositories.filter(repository =>
                    !skips || Object.hasOwn(skips, repository.root)
                );
                const logs = await Promise.all(repositories.map(async repository => ({
                    repository,
                    root: repository.root,
                    skip: skips?.[repository.root] ?? 0,
                    commits: unwrapOk(
                        await log(contextFor(git, "log"), repository.root, {
                            maxEntries: limit + 1,
                            skip: skips?.[repository.root],
                            shortStats: true,
                            signal,
                        }),
                    ),
                })));
                const { page, nextSkip } = getWorkspaceTimelinePage(
                    logs,
                    limit,
                    (commit, index) => {
                        const entry = logs[index];
                        if (!entry) throw new Error("Unknown workspace Timeline repository");
                        return timestamp(commit, entry.repository);
                    },
                );
                const items = await Promise.all(page.map(async ({ log: index, commit }) => {
                    const source = logs[index];
                    if (!source) throw new Error("Unknown workspace Timeline repository");
                    const repository = source.repository;
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
                return { items, cursor: nextSkip ? JSON.stringify(nextSkip) : undefined };
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
    disposables.push(
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
        Disposable.from(...disposables).dispose();
    });
}
