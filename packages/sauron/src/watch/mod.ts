import { err, isErr, ok, type Result, unwrap } from "monolithic-git-interop/util/result";
import type { Backend, BackendError, RawEvent } from "../backend/mod.js";
import { createNodeBackend } from "../backend/node.js";
import { ignoreNothing, type Ignorer, type IgnoreScope } from "../ignore/mod.js";
import {
    type AbsolutePath,
    type EntryKind,
    type FileName,
    isWithin,
    join,
    joinRelative,
    type RelativePath,
} from "../path.js";
import { type ChangeSet, createChangeBuffer } from "./changes.js";
import { createLimiter } from "./limiter.js";

export type WatchError = {
    readonly type: "watch-failed" | "readdir-failed" | "ignore-failed" | "internal";
    readonly path: AbsolutePath | null;
    readonly cause: unknown;
};

export type WatchEvent =
    /** Initial crawl progress. `done: true` means every reachable directory is watched. */
    | { readonly type: "crawl"; readonly directories: number; readonly done: boolean }
    /** Changes are accumulating but have not settled. Sent once per batch, dropped if the batch settles first. */
    | { readonly type: "activity"; readonly since: number }
    | ({ readonly type: "changes" } & ChangeSet)
    | { readonly type: "suspended"; readonly reason: string }
    | { readonly type: "resumed" }
    /** Changes under `scope` are no longer (fully) observed. */
    | { readonly type: "degraded"; readonly scope: AbsolutePath; readonly error: WatchError }
    | { readonly type: "error"; readonly error: WatchError };

export type CloseReason = { readonly type: "disposed" | "aborted" };

export type WatcherState = "crawling" | "watching" | "suspended" | "closed";

/**
 * Single consumer. Iterating yields events; leaving a `for await` loop closes the watcher.
 * Never throws, iteration ends with a {@link CloseReason}.
 */
export type Watcher =
    & AsyncIterator<WatchEvent, CloseReason, undefined>
    & AsyncIterable<WatchEvent, CloseReason, undefined>
    & AsyncDisposable
    & {
        readonly state: WatcherState;
        readonly closed: Promise<CloseReason>;
        /**
         * Holds back `changes` until every handle is disposed, then releases them as one batch.
         * Directories keep being watched meanwhile, so resuming does not re-crawl.
         * Disposal settles once the watched tree reflects changes made while suspended.
         */
        suspend(reason: string): AsyncDisposable;
        /** Re-crawls `scope` (default: every root) and reports it as changed. */
        rescan(scope?: AbsolutePath): void;
    };

export type WatchOptions = {
    /** Directories to watch. Roots nested inside another root are dropped. */
    readonly roots: readonly [AbsolutePath, ...AbsolutePath[]];
    readonly ignore?: Ignorer;
    readonly signal?: AbortSignal;
    /** Milliseconds. A batch is released after `quiet` without changes, or `maxWait` after it began. */
    readonly settle?: { readonly quiet: number; readonly maxWait: number };
    /** Changed entries in one directory before it is reported as a subtree instead. */
    readonly collapseAt?: number;
    /** Concurrent directory reads. */
    readonly concurrency?: number;
    readonly backend?: Backend;
};

export type WatchSetupError =
    | { readonly type: "invalid-option"; readonly option: string; readonly reason: string }
    | { readonly type: "aborted" };

const DEFAULT_QUIET = 500;
const DEFAULT_MAX_WAIT = 5_000;
const DEFAULT_COLLAPSE_AT = 256;
const DEFAULT_CONCURRENCY = 32;
const MAX_NOTICES = 100;

export function watch(options: WatchOptions): Result<Watcher, WatchSetupError> {
    const quiet = options.settle?.quiet ?? DEFAULT_QUIET;
    const maxWait = options.settle?.maxWait ?? DEFAULT_MAX_WAIT;
    const collapseAt = options.collapseAt ?? DEFAULT_COLLAPSE_AT;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

    if (!Number.isFinite(quiet) || quiet < 0) {
        return err({ type: "invalid-option", option: "settle.quiet", reason: "must be a finite number >= 0" });
    }
    if (!Number.isFinite(maxWait) || maxWait < quiet) {
        return err({ type: "invalid-option", option: "settle.maxWait", reason: "must be finite and >= quiet" });
    }
    if (!Number.isSafeInteger(collapseAt) || collapseAt < 1) {
        return err({ type: "invalid-option", option: "collapseAt", reason: "must be an integer >= 1" });
    }
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
        return err({ type: "invalid-option", option: "concurrency", reason: "must be an integer >= 1" });
    }
    if (options.signal?.aborted) {
        return err({ type: "aborted" });
    }

    return ok(createWatcher({
        backend: options.backend ?? createNodeBackend(),
        collapseAt,
        concurrency,
        ignore: options.ignore ?? ignoreNothing,
        maxWait,
        quiet,
        roots: options.roots,
        signal: options.signal ?? null,
    }));
}

type DirNode = {
    readonly path: AbsolutePath;
    readonly name: FileName | null;
    readonly relative: RelativePath | null;
    readonly parent: DirNode | null;
    readonly ignorer: Ignorer;
    readonly controller: AbortController;
    readonly children: Map<FileName, DirNode>;
    /** Last listing. Events for names outside it wait for a rescan to apply ignore rules. */
    entries: ReadonlyMap<FileName, EntryKind>;
    pendingNames: Set<FileName>;
    ignored: ReadonlySet<FileName>;
    childIgnorer: Ignorer;
    rescanRunning: boolean;
    rescanPending: boolean;
    rescanDeep: boolean;
};

type StatusKey = "crawl" | "activity" | "suspension";

type Config = {
    readonly backend: Backend;
    readonly collapseAt: number;
    readonly concurrency: number;
    readonly ignore: Ignorer;
    readonly maxWait: number;
    readonly quiet: number;
    readonly roots: readonly AbsolutePath[];
    readonly signal: AbortSignal | null;
};

function createWatcher(config: Config): Watcher {
    const { backend } = config;
    const limit = createLimiter(config.concurrency);
    const buffer = createChangeBuffer(config.collapseAt);
    const roots = new Map<AbsolutePath, DirNode>();
    const closed = Promise.withResolvers<CloseReason>();

    // Delivery state. Status events conflate (latest per key wins), notices queue (bounded).
    const status = new Map<StatusKey, WatchEvent>();
    const notices: WatchEvent[] = [];
    const waiters: PromiseWithResolvers<IteratorResult<WatchEvent, CloseReason>>[] = [];
    let batchReady = false;
    let batchStart: number | null = null;
    let quietTimer: NodeJS.Timeout | undefined;
    let maxTimer: NodeJS.Timeout | undefined;

    const inflight = new Set<Promise<void>>();
    const rescans = new Set<Promise<void>>();
    let suspendCount = 0;
    let crawlDone = false;
    let crawledDirectories = 0;
    let closeReason: CloseReason | null = null;

    function nextEvent(): WatchEvent | null {
        const notice = notices.shift();
        if (notice !== undefined) {
            return notice;
        }
        if (batchReady && suspendCount === 0) {
            batchReady = false;
            batchStart = null;
            status.delete("activity");
            return { type: "changes", ...buffer.take() };
        }
        const first = status.entries().next();
        if (first.done) {
            return null;
        }
        const [key, event] = first.value;
        status.delete(key);
        return event;
    }

    function deliver(): void {
        while (waiters.length > 0) {
            const event = nextEvent();
            if (event === null) {
                return;
            }
            waiters.shift()!.resolve({ done: false, value: event });
        }
    }

    function setStatus(key: StatusKey, event: WatchEvent): void {
        status.delete(key);
        status.set(key, event);
        deliver();
    }

    function notify(event: WatchEvent): void {
        if (closeReason === null && notices.length < MAX_NOTICES) {
            notices.push(event);
            deliver();
        }
    }

    function clearTimers(): void {
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        quietTimer = maxTimer = undefined;
    }

    /** In-flight rescans may still be classifying new names, so only `maxWait` overrides them. */
    function settle(force: boolean): void {
        if (!force && rescans.size > 0) {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(settle, config.quiet, false);
            return;
        }
        clearTimers();
        if (buffer.size > 0) {
            batchReady = true;
            deliver();
        }
    }

    function onActivity(): void {
        if (closeReason !== null || buffer.size === 0 || batchReady || suspendCount > 0) {
            return;
        }
        if (batchStart === null) {
            batchStart = Date.now();
            setStatus("activity", { type: "activity", since: batchStart });
            maxTimer = setTimeout(settle, config.maxWait, true);
        }
        clearTimeout(quietTimer);
        quietTimer = setTimeout(settle, config.quiet, false);
    }

    function recordPath(target: AbsolutePath): void {
        buffer.addPath(target);
        onActivity();
    }

    function recordSubtree(dir: AbsolutePath): void {
        buffer.addSubtree(dir);
        onActivity();
    }

    function track(task: Promise<void>, isRescan: boolean): void {
        const tracked: Promise<void> = task
            .catch(cause => notify({ type: "error", error: { type: "internal", path: null, cause } }))
            .finally(() => {
                inflight.delete(tracked);
                rescans.delete(tracked);
            });
        inflight.add(tracked);
        if (isRescan) {
            rescans.add(tracked);
        }
    }

    async function drain(tasks: Set<Promise<void>>): Promise<void> {
        while (tasks.size > 0) {
            await Promise.allSettled(tasks);
        }
    }

    function teardown(node: DirNode): void {
        node.controller.abort();
        for (const child of node.children.values()) {
            teardown(child);
        }
        node.children.clear();
    }

    function detach(node: DirNode): void {
        teardown(node);
        if (node.parent === null) {
            roots.delete(node.path);
        } else if (node.name !== null && node.parent.children.get(node.name) === node) {
            node.parent.children.delete(node.name);
        }
    }

    function reportBackendError(scope: AbsolutePath, type: WatchError["type"], error: BackendError): void {
        const watchError: WatchError = { type, path: error.path, cause: error };
        notify(
            error.type === "other"
                ? { type: "error", error: watchError }
                : { type: "degraded", scope, error: watchError },
        );
    }

    async function visit(node: DirNode, entries: ReadonlyMap<FileName, EntryKind>): Promise<IgnoreScope> {
        const signal = node.controller.signal;
        try {
            return await node.ignorer.visit({
                path: node.path,
                relative: node.relative,
                entries,
                signal,
                async readText(name) {
                    const read = await backend.readText(join(node.path, name), signal);
                    return isErr(read) ? null : unwrap(read);
                },
            });
        } catch (cause) {
            notify({ type: "error", error: { type: "ignore-failed", path: node.path, cause } });
            return { ignored: new Set() };
        }
    }

    /** Lists `node`, applies ignore rules and reconciles subdirectory watches. */
    async function populate(node: DirNode, reportNew: boolean): Promise<void> {
        const signal = node.controller.signal;
        // Names arriving after this point are handled by the rescan they schedule.
        const pendingNames = node.pendingNames;
        node.pendingNames = new Set();
        const listed = await limit(() => backend.readdir(node.path, signal));
        if (signal.aborted) {
            return;
        }
        if (isErr(listed)) {
            const error = unwrap(listed);
            if (error.type === "not-found") {
                // Its parent reports the removal; a root has no parent so is reported as degraded.
                if (node.parent === null) {
                    reportBackendError(node.path, "readdir-failed", error);
                }
                detach(node);
                return;
            }
            reportBackendError(node.path, "readdir-failed", error);
            return;
        }
        const entries = unwrap(listed);
        const scope = await visit(node, entries);
        if (signal.aborted) {
            return;
        }
        node.ignored = scope.ignored;
        node.childIgnorer = scope.child ?? node.ignorer;
        node.entries = entries;
        // A name gone again by now was transient, and its kind (needed for ignore rules) is unknown.
        for (const name of pendingNames) {
            if (entries.has(name) && !node.ignored.has(name)) {
                recordPath(join(node.path, name));
            }
        }

        for (const [name, child] of node.children) {
            if (entries.get(name) !== "directory" || node.ignored.has(name)) {
                detach(child);
            }
        }
        const crawls: Promise<void>[] = [];
        for (const [name, kind] of entries) {
            if (kind === "directory" && !node.ignored.has(name) && !node.children.has(name)) {
                crawls.push(crawl(join(node.path, name), node, name, reportNew));
            }
        }
        await Promise.all(crawls);
    }

    /** Watches first, then lists, so nothing created in between is missed. */
    function crawl(path: AbsolutePath, parent: DirNode | null, name: FileName | null, isNew: boolean): Promise<void> {
        if (closeReason !== null) {
            return Promise.resolve();
        }
        const ignorer = parent?.childIgnorer ?? config.ignore;
        const node: DirNode = {
            path,
            name,
            relative: parent === null || name === null ? null : joinRelative(parent.relative, name),
            parent,
            ignorer,
            controller: new AbortController(),
            children: new Map(),
            entries: new Map(),
            pendingNames: new Set(),
            ignored: new Set(),
            childIgnorer: ignorer,
            // The initial populate counts as a rescan, so events during it queue one more.
            rescanRunning: true,
            rescanPending: false,
            rescanDeep: false,
        };
        const watched = backend.watch(path, event => onRaw(node, event), node.controller.signal);
        if (isErr(watched)) {
            node.controller.abort();
            const error = unwrap(watched);
            // A vanished subdirectory is reported by its parent.
            if (error.type !== "not-found" || parent === null) {
                reportBackendError(path, "watch-failed", error);
            }
            return Promise.resolve();
        }
        if (parent === null || name === null) {
            roots.set(path, node);
        } else {
            parent.children.set(name, node);
        }
        if (isNew) {
            // Anything created before the watch was registered is covered by the subtree.
            recordSubtree(path);
        }
        if (!crawlDone) {
            crawledDirectories++;
            setStatus("crawl", { type: "crawl", directories: crawledDirectories, done: false });
        }
        return populate(node, isNew).finally(() => {
            node.rescanRunning = false;
            startRescans(node);
        });
    }

    function startRescans(node: DirNode): void {
        if (node.rescanPending && !node.rescanRunning && !node.controller.signal.aborted && closeReason === null) {
            node.rescanRunning = true;
            track(runRescans(node), true);
        }
    }

    function scheduleRescan(node: DirNode, deep: boolean): void {
        node.rescanPending = true;
        node.rescanDeep ||= deep;
        startRescans(node);
    }

    /** At most one rescan runs per directory; events during it coalesce into one more. */
    async function runRescans(node: DirNode): Promise<void> {
        try {
            while (node.rescanPending && !node.controller.signal.aborted) {
                node.rescanPending = false;
                if (node.rescanDeep) {
                    node.rescanDeep = false;
                    for (const child of node.children.values()) {
                        detach(child);
                    }
                }
                await populate(node, true);
            }
        } finally {
            node.rescanRunning = false;
        }
    }

    function onRaw(node: DirNode, event: RawEvent): void {
        if (closeReason !== null || node.controller.signal.aborted) {
            return;
        }
        const { type, name } = event;
        if (name === null) {
            recordSubtree(node.path);
            scheduleRescan(node, false);
            return;
        }
        if (node.ignorer.triggers?.has(name)) {
            // Ignore rules for this subtree may have changed.
            recordSubtree(node.path);
            scheduleRescan(node, true);
            return;
        }
        if (node.ignored.has(name)) {
            return;
        }
        if (!node.entries.has(name)) {
            node.pendingNames.add(name);
            scheduleRescan(node, false);
            return;
        }
        recordPath(join(node.path, name));
        if (type === "rename") {
            // The directory may have been replaced, and an old watch keeps following the original.
            const child = node.children.get(name);
            if (child !== undefined) {
                detach(child);
            }
            scheduleRescan(node, false);
        }
    }

    function findNode(target: AbsolutePath): DirNode | null {
        for (const root of roots.values()) {
            if (root.path !== target && !isWithin(target, root.path)) {
                continue;
            }
            let node = root;
            const rest = target.slice(root.path.length).split("/").filter(s => s !== "");
            for (const segment of rest) {
                const child = node.children.get(segment as FileName);
                if (child === undefined) {
                    break;
                }
                node = child;
            }
            return node;
        }
        return null;
    }

    async function close(reason: CloseReason): Promise<void> {
        if (closeReason === null) {
            closeReason = reason;
            config.signal?.removeEventListener("abort", onAbort);
            clearTimers();
            for (const root of roots.values()) {
                teardown(root);
            }
            roots.clear();
            notices.length = 0;
            status.clear();
            batchReady = false;
            buffer.take();
            for (const waiter of waiters.splice(0)) {
                waiter.resolve({ done: true, value: reason });
            }
            closed.resolve(reason);
        }
        await drain(inflight);
    }

    function onAbort(): void {
        void close({ type: "aborted" });
    }

    config.signal?.addEventListener("abort", onAbort, { once: true });

    const uniqueRoots = new Set(config.roots);
    const topRoots = [...uniqueRoots].filter(r => !uniqueRoots.values().some(o => isWithin(r, o)));
    track(
        Promise.all(topRoots.map(root => crawl(root, null, null, false))).then(() => {
            crawlDone = true;
            setStatus("crawl", { type: "crawl", directories: crawledDirectories, done: true });
        }),
        false,
    );

    const watcher: Watcher = {
        get state() {
            if (closeReason !== null) {
                return "closed";
            }
            if (suspendCount > 0) {
                return "suspended";
            }
            return crawlDone ? "watching" : "crawling";
        },
        closed: closed.promise,
        next() {
            if (closeReason !== null) {
                return Promise.resolve({ done: true, value: closeReason });
            }
            const event = nextEvent();
            if (event !== null) {
                return Promise.resolve({ done: false, value: event });
            }
            const waiter = Promise.withResolvers<IteratorResult<WatchEvent, CloseReason>>();
            waiters.push(waiter);
            return waiter.promise;
        },
        async return() {
            await close({ type: "disposed" });
            return { done: true, value: closeReason! };
        },
        [Symbol.asyncIterator]() {
            return watcher;
        },
        [Symbol.asyncDispose]() {
            return close({ type: "disposed" });
        },
        suspend(reason) {
            if (closeReason !== null) {
                return { [Symbol.asyncDispose]: async () => {} };
            }
            suspendCount++;
            if (suspendCount === 1) {
                clearTimers();
                batchStart = null;
                status.delete("activity");
                setStatus("suspension", { type: "suspended", reason });
            }
            let released = false;
            return {
                async [Symbol.asyncDispose]() {
                    if (released || closeReason !== null) {
                        return;
                    }
                    released = true;
                    // Stay suspended until the tree reflects what happened, so nothing leaks out early.
                    if (suspendCount === 1) {
                        await drain(rescans);
                    }
                    if (closeReason !== null) {
                        return;
                    }
                    suspendCount--;
                    if (suspendCount > 0) {
                        return;
                    }
                    setStatus("suspension", { type: "resumed" });
                    if (buffer.size > 0) {
                        batchReady = true;
                        deliver();
                    }
                },
            };
        },
        rescan(scope) {
            if (closeReason !== null) {
                return;
            }
            const targets = scope === undefined ? [...roots.values()] : [findNode(scope)];
            for (const node of targets) {
                if (node !== null) {
                    recordSubtree(node.path);
                    scheduleRescan(node, true);
                }
            }
        },
    };
    return watcher;
}
