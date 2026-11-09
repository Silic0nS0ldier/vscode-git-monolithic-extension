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
} from "vscode";
import { Status } from "../api/git.js";
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
import { createEmojifier } from "./emoji.js";
import { contextFor } from "./git-context.js";
import { GitTimelineItem, resolveOpenDiff } from "./item.js";
import { getFileTimelinePage, orderedTimestamp, parseFileCursor, remainingLiveOffset } from "./paging.js";

const PROVIDER_ID = "gitm-history";
const PAGE_SIZE = 50;

export function createTimelineProvider(model: Model, git: Git, extensionUri: Uri): Disposable {
    const fileChanged = new EventEmitter<Uri | Uri[] | undefined>();
    const shutdown = new AbortController();
    const subscriptions = new Map<AbstractRepository, Disposable>();
    const operationDates = new Map<AbstractRepository, number>();
    const emptyTrees = new Map<string, string>();
    const disposables: Disposable[] = [fileChanged];
    const emojify = createEmojifier(extensionUri);
    let registered = false;

    const fireChanged = debounce(() => {
        if (!shutdown.signal.aborted) fileChanged.fire(undefined);
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
        previousRef: string,
        previousUri: Uri,
        date: number,
        orderDate: number,
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
            "gitm:file:commit",
            rootUri,
            previousUri,
        );
        result.iconPath = new ThemeIcon("git-commit");
        result.description = [
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

    const provider: TimelineProvider = {
        onDidChangeTimeline: fileChanged.event,
        provideTimeline: (uri, options, token) =>
            request(token, async signal => {
                const repository = model.getRepository(uri);
                if (!repository) return { items: [] };
                const fileUri = uri.scheme === "gitm" ? Uri.file(fromGitUri(uri).path) : uri;
                try {
                    if (((await workspace.fs.stat(fileUri)).type & FileType.Directory) !== 0) return { items: [] };
                } catch (ex) {
                    if (!(ex instanceof FileSystemError) || ex.code !== "FileNotFound") throw ex;
                }
                const limit = limitFor(options);
                const cursor = options.cursor ? parseFileCursor(options.cursor) : undefined;
                const live = !cursor || cursor.liveOffset !== undefined;
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
                const tip = !cursor && headCommit && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(headCommit)
                    ? headCommit
                    : cursor?.hash;
                const skip = cursor?.skip ?? 0;
                const commits = unwrapOk(
                    await log(contextFor(git, "log"), repository.root, {
                        path: `:(literal)${sanitizePath(logPath)}`,
                        hash: tip,
                        discard: skip || undefined,
                        maxEntries: limit + 1,
                        topoOrder: true,
                        follow: true,
                        filePaths: true,
                        shortStats: true,
                        signal,
                    }),
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
                        entry.tooltip = `${entry.tooltip ?? ""}\n\n${
                            i18n.Translations.timelineLiveDateOrderExplanation(new Date(date).toLocaleString())
                        }`;
                    }
                    entry.timestamp = orderDate;
                    before = orderDate;
                }
                for (const [index, commit] of commits.slice(0, page.commitCount).entries()) {
                    const next = commits[index + 1];
                    const previousRef = next?.hash ?? await tree(repository, signal);
                    const previousPath = next?.filePath ? Uri.file(path.join(repository.root, next.filePath)) : fileUri;
                    const date = timestamp(commit, repository);
                    const orderDate = orderedTimestamp(date, before);
                    const entry = await item(
                        repository,
                        commit,
                        previousRef,
                        toGitUri(previousPath, previousRef),
                        date,
                        orderDate,
                    );
                    const commitPath = commit.filePath
                        ? Uri.file(path.join(repository.root, commit.filePath))
                        : fileUri;
                    entry.resourceUri = toGitUri(commitPath, commit.hash);
                    entry.command = resolveOpenDiff(entry, fileUri);
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
    };

    function register(): void {
        if (registered) return;
        disposables.push(workspace.registerTimelineProvider(
            PROVIDER_ID,
            i18n.Translations.timelineSource(),
            ["file", "gitm", "vscode-remote", "vscode-local-history"],
            provider,
        ));
        registered = true;
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
        }),
        model.onDidCloseRepository(repository => {
            subscriptions.get(repository)?.dispose();
            subscriptions.delete(repository);
            operationDates.delete(repository);
            emptyTrees.delete(repository.root);
            fireChanged();
        }),
        model.onDidChangeRepository(() => fireChanged()),
        workspace.onDidChangeConfiguration(event => {
            if (
                config.timelineDate.affected(event) || config.timelineShowAuthor.affected(event)
                || config.timelineShowUncommitted.affected(event)
            ) {
                fireChanged();
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
