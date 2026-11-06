import { err, isErr, ok, type Result, unwrap } from "monolithic-git-interop/util/result";
import type { Backend, BackendError, RawEvent, Stat } from "../backend/mod.js";
import { createNodeBackend } from "../backend/node.js";
import { type DirectoryLocation, ignoreNothing, type Ignorer, type IgnoreScope } from "../ignore/mod.js";
import {
    type AbsolutePath,
    type EntryKind,
    type FileName,
    isWithin,
    join,
    joinRelative,
    parent,
    type RelativePath,
} from "../path.js";
import { type ChangeSet, createChangeBuffer } from "./changes.js";
import { createLimiter } from "./limiter.js";

export type WatchError = {
    readonly type: "watch-failed" | "watch-lost" | "readdir-failed" | "stat-failed" | "ignore-failed" | "internal";
    readonly path: AbsolutePath | null;
    readonly cause: unknown;
};

export type WatchEvent =
    /**
     * Initial crawl progress. `done: true` once every reachable directory has been visited; any that failed are
     * being retried, and are reported as `degraded` if they keep failing.
     */
    | { readonly type: "crawl"; readonly directories: number; readonly done: boolean }
    /** Changes are accumulating but have not settled. Sent once per batch, dropped if the batch settles first. */
    | { readonly type: "activity"; readonly since: number }
    | ({ readonly type: "changes" } & ChangeSet)
    | { readonly type: "suspended"; readonly reason: string }
    | { readonly type: "resumed" }
    /** Changes under `scope` are no longer (fully) observed, as it kept failing. Sent once per failure streak. */
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
    /**
     * Directories (watched recursively) or files to watch. They need not exist yet, and may be removed and
     * re-created. Roots nested inside another root are dropped.
     */
    readonly roots: readonly [AbsolutePath, ...AbsolutePath[]];
    /**
     * Whether a root that is a symlink is resolved to its target (default), which is watched while the symlink
     * dangles or loops as if the root were missing. Otherwise the symlink itself is watched like a file root, and
     * its target is never read. Symlinks within a root are never followed.
     */
    readonly followRootSymlinks?: boolean;
    readonly ignore?: Ignorer;
    readonly signal?: AbortSignal;
    /** Milliseconds. A batch is released after `quiet` without changes, or `maxWait` after it began. */
    readonly settle?: { readonly quiet: number; readonly maxWait: number };
    /** Changed entries in one directory before it is reported as a subtree instead. */
    readonly collapseAt?: number;
    /** Concurrent directory reads. */
    readonly concurrency?: number;
    /**
     * Failed watches and listings are retried `attempts` times, `delay` ms apart doubling up to `maxDelay`. A path
     * that runs out of attempts is reported as `degraded` and left alone, until `cooldown` ms after its last
     * failure (or an explicit `rescan`).
     */
    readonly retry?: {
        readonly attempts?: number;
        readonly delay?: number;
        readonly maxDelay?: number;
        readonly cooldown?: number;
    };
    readonly backend?: Backend;
};

export type WatchSetupError =
    | { readonly type: "invalid-option"; readonly option: string; readonly reason: string }
    | { readonly type: "aborted" };

const DEFAULT_QUIET = 500;
const DEFAULT_MAX_WAIT = 5_000;
const DEFAULT_COLLAPSE_AT = 256;
const DEFAULT_CONCURRENCY = 32;
type RetryPolicy = {
    readonly attempts: number;
    readonly delay: number;
    readonly maxDelay: number;
    readonly cooldown: number;
};
const DEFAULT_RETRY: RetryPolicy = { attempts: 5, delay: 100, maxDelay: 10_000, cooldown: 60_000 };
const MAX_NOTICES = 100;
/** Bounds re-checks when the tree keeps changing while a root's anchor moves. */
const MAX_RESOLVE_ATTEMPTS = 16;

function nextMacrotask(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

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
    const retry = { ...DEFAULT_RETRY, ...options.retry };
    if (!Number.isSafeInteger(retry.attempts) || retry.attempts < 0) {
        return err({ type: "invalid-option", option: "retry.attempts", reason: "must be an integer >= 0" });
    }
    if (!Number.isFinite(retry.delay) || retry.delay < 0) {
        return err({ type: "invalid-option", option: "retry.delay", reason: "must be a finite number >= 0" });
    }
    if (!Number.isFinite(retry.maxDelay) || retry.maxDelay < retry.delay) {
        return err({ type: "invalid-option", option: "retry.maxDelay", reason: "must be finite and >= delay" });
    }
    if (!Number.isFinite(retry.cooldown) || retry.cooldown < 0) {
        return err({ type: "invalid-option", option: "retry.cooldown", reason: "must be a finite number >= 0" });
    }
    if (options.signal?.aborted) {
        return err({ type: "aborted" });
    }

    return ok(createWatcher({
        backend: options.backend ?? createNodeBackend(),
        collapseAt,
        concurrency,
        followRootSymlinks: options.followRootSymlinks ?? true,
        ignore: options.ignore ?? ignoreNothing,
        maxWait,
        quiet,
        retry,
        roots: options.roots,
        signal: options.signal ?? null,
    }));
}

type DirNode = {
    /** Path, name, relative path and parent change when a moved directory is adopted at its new place. */
    path: AbsolutePath;
    name: FileName | null;
    relative: RelativePath | null;
    parent: DirNode | null;
    ignorer: Ignorer;
    readonly controller: AbortController;
    readonly children: Map<FileName, DirNode>;
    /** Last listing. Events for names outside it wait for a rescan to apply ignore rules. */
    entries: ReadonlyMap<FileName, EntryKind>;
    pendingNames: Set<FileName>;
    /** Whether it has been listed successfully. */
    listed: boolean;
    ignored: ReadonlySet<FileName>;
    childIgnorer: Ignorer;
    rescanRunning: boolean;
    rescanPending: boolean;
    rescanDeep: boolean;
    /**
     * {@link Stat.id} of the watched directory. Only known for directories with watched subdirectories, which
     * are worth keeping watched when moved; anything else is cheaper to watch again.
     */
    id: string | null;
    /** Name when its watch was registered, which libuv names events about the directory itself after. */
    readonly watchedAs: FileName | null;
    /**
     * Moved away (or being adopted where it moved to), so its paths are stale. Its watches are kept, events only
     * mark it for a rescan once adopted, and nothing is listed.
     */
    orphaned: boolean;
    /** Times it has been orphaned, so work started before a move can tell it is stale. */
    moves: number;
    /**
     * Was being listed when moved. The listing, or subdirectories watched since, may be of whatever replaced it
     * at its old path, so it is not reused.
     */
    suspect: boolean;
    /** Had events while orphaned, which only mark it for a rescan. Reported as a subtree once in place. */
    missed: boolean;
    /** The orphan's own move is still to be reported to it (as an event named after itself), and is dropped. */
    expectSelf: boolean;
    /**
     * Had an event named after itself since it was last listed. A deleted directory has two (before its parent
     * is told), a moved one only one (after), so it may have been deleted: its watch is dead, and an inode
     * number reused by a new directory must not lead to it. Also set by an entry named like the directory.
     */
    maybeDeleted: boolean;
    /** Names being matched against orphans. A `rename` of one while matching means the match is stale. */
    adopting: Map<FileName, { valid: boolean }> | null;
};

/**
 * A configured root. Its anchor watches the nearest existing ancestor (normally the parent), which observes
 * the root being created, removed or replaced, and changes to a root that is a file.
 */
type RootState = {
    readonly path: AbsolutePath;
    kind: "pending" | "directory" | "file";
    /** {@link Stat.id} when last resolved. */
    id: string | null;
    /** `real` is where the root resolves to through symlinks, when that is elsewhere. */
    anchor: {
        readonly dir: AbsolutePath;
        readonly real: AbsolutePath | null;
        readonly controller: AbortController;
    } | null;
    resolveRunning: boolean;
    resolvePending: boolean;
    /** Whether a pending resolve may replace the tree. Otherwise it only verifies the root is unchanged. */
    resolveFull: boolean;
    /** Whether a pending resolve runs even while the root's failures are backing off. */
    resolveForced: boolean;
};

type Failure = {
    count: number;
    /** When it last failed. */
    last: number;
    /** When it first succeeded since then. The streak ends once it has worked for a `cooldown`. */
    okSince: number | undefined;
    timer: NodeJS.Timeout | undefined;
    /** The latest way to retry; earlier ones may refer to state that has since moved on. */
    retry: () => void;
};

function anchorKey(root: RootState): string {
    return `${root.path}\0anchor`;
}

/** The name in `dir` on the way to `target`, which is within it. */
function nextSegment(dir: AbsolutePath, target: AbsolutePath): string {
    return target.slice(dir.length + (dir.endsWith("/") ? 0 : 1)).split("/", 1)[0]!;
}

/** libuv names events about a watched directory itself (removed, moved) after it. `null` for a file system root. */
function selfName(dir: AbsolutePath): string | null {
    return parent(dir) === null ? null : dir.slice(dir.lastIndexOf("/") + 1);
}

/** Directories above `dir` (and above `real`) to the file system root, with the names leading towards them. */
function ancestorsOf(dir: AbsolutePath, real: AbsolutePath | null): Map<AbsolutePath, Set<string>> {
    const chain = new Map<AbsolutePath, Set<string>>();
    const add = (target: AbsolutePath, from: AbsolutePath | null) => {
        for (let current = from; current !== null; current = parent(current)) {
            const names = chain.get(current) ?? new Set();
            names.add(nextSegment(current, target));
            chain.set(current, names);
        }
    };
    add(dir, parent(dir));
    if (real !== null) {
        add(real, parent(real));
    }
    return chain;
}

function isRelocatable(ignorer: Ignorer, from: DirectoryLocation, to: DirectoryLocation): boolean {
    return ignorer.relocatable?.(from, to) ?? false;
}

type StatusKey = "crawl" | "activity" | "suspension";

type Config = {
    readonly backend: Backend;
    readonly collapseAt: number;
    readonly concurrency: number;
    readonly followRootSymlinks: boolean;
    readonly ignore: Ignorer;
    readonly maxWait: number;
    readonly quiet: number;
    readonly retry: RetryPolicy;
    readonly roots: readonly AbsolutePath[];
    readonly signal: AbortSignal | null;
};

function createWatcher(config: Config): Watcher {
    const { backend } = config;
    const limit = createLimiter(config.concurrency);
    const buffer = createChangeBuffer(config.collapseAt);
    /** Watched directory trees, keyed by root. */
    const roots = new Map<AbsolutePath, DirNode>();
    const rootStates = new Map<AbsolutePath, RootState>();
    /** Keyed by path, or by `anchorKey(root)` for an anchor. */
    const failures = new Map<string, Failure>();
    /** Moved subtrees that may reappear within a root, by {@link DirNode.id}. Torn down once rescans settle. */
    const orphans = new Map<string, DirNode>();
    const closed = Promise.withResolvers<CloseReason>();

    // Delivery state. Status events conflate (latest per key wins), notices queue (bounded).
    const status = new Map<StatusKey, WatchEvent>();
    const notices: WatchEvent[] = [];
    const waiters: PromiseWithResolvers<IteratorResult<WatchEvent, CloseReason>>[] = [];
    let batchReady = false;
    let batchStart: number | null = null;
    let quietTimer: NodeJS.Timeout | undefined;
    let maxTimer: NodeJS.Timeout | undefined;

    const closedController = new AbortController();
    const closedSignal = closedController.signal;
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
            quietTimer?.refresh();
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
            quietTimer = setTimeout(settle, config.quiet, false);
        } else {
            // Cheaper than replacing the timer on every event.
            quietTimer?.refresh();
        }
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
                if (rescans.size === 0 && orphans.size > 0) {
                    // Every rescan the move scheduled is done, so where it went is not watched.
                    discardOrphans();
                }
            });
        inflight.add(tracked);
        if (isRescan) {
            rescans.add(tracked);
        }
    }

    let orphanCheck = false;

    /**
     * Discards orphans after the events being handled, unless a rescan may yet find them. Normally the rescan
     * a move schedules does that, but one may not start (e.g. while its directory's failures back off).
     */
    function checkOrphans(): void {
        if (!orphanCheck) {
            orphanCheck = true;
            setImmediate(() => {
                orphanCheck = false;
                if (rescans.size === 0) {
                    discardOrphans();
                }
            });
        }
    }

    function discardOrphans(): void {
        for (const orphan of orphans.values()) {
            teardown(orphan);
        }
        orphans.clear();
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

    /** Whether `key` must not be tried now: a retry is due later, or it ran out of attempts recently. */
    function blocked(key: string): boolean {
        const failure = failures.get(key);
        return failure !== undefined && (
            failure.timer !== undefined
            || (failure.count > config.retry.attempts && performance.now() - failure.last <= config.retry.cooldown)
        );
    }

    /**
     * Records a failure of `key` and calls `retry` after a backoff. Out of attempts, reports `scope` as degraded
     * instead. Retries never run synchronously, so a failure that recurs immediately cannot loop.
     */
    function failed(key: string, scope: AbsolutePath, error: WatchError, retry: () => void): void {
        if (closeReason !== null) {
            return;
        }
        const now = performance.now();
        let failure = failures.get(key);
        if (failure !== undefined && failure.timer !== undefined) {
            failure.retry = retry;
            return;
        }
        // A streak only ends once the key has worked for a cooldown, or a cooldown after giving up on it. Time
        // alone does not end it, as a retry may take longer than that to fail (e.g. queued behind a crawl).
        const exhausted = failure !== undefined && failure.count > config.retry.attempts;
        if (
            failure === undefined
            || (exhausted && now - failure.last > config.retry.cooldown)
            || (failure.okSince !== undefined && now - failure.okSince > config.retry.cooldown)
        ) {
            failure = { count: 0, last: now, okSince: undefined, timer: undefined, retry };
            failures.set(key, failure);
        }
        failure.retry = retry;
        failure.okSince = undefined;
        failure.count++;
        failure.last = now;
        if (failure.count > config.retry.attempts) {
            if (failure.count === config.retry.attempts + 1) {
                notify({ type: "degraded", scope, error });
            }
            return;
        }
        const delay = Math.min(config.retry.delay * 2 ** (failure.count - 1), config.retry.maxDelay);
        const due = failure;
        due.timer = setTimeout(() => {
            due.timer = undefined;
            if (closeReason === null) {
                due.retry();
            }
        }, delay);
    }

    /** Notes that `key` worked. Its failures are forgotten only if it keeps working, so flapping still adds up. */
    function succeeded(key: string): void {
        if (failures.size > 0) {
            const failure = failures.get(key);
            if (failure !== undefined) {
                failure.okSince ??= performance.now();
            }
        }
    }

    /** Runs every pending retry now, returning whether there were any. Each failure reschedules with a timer. */
    function retryNow(): boolean {
        let any = false;
        for (const failure of failures.values()) {
            if (failure.timer !== undefined) {
                clearTimeout(failure.timer);
                failure.timer = undefined;
                failure.retry();
                any = true;
            }
        }
        return any;
    }

    function forgetFailures(scope: AbsolutePath | undefined): void {
        for (const [key, failure] of failures) {
            const path = key.split("\0", 1)[0] as AbsolutePath;
            if (scope === undefined || path === scope || isWithin(path, scope)) {
                clearTimeout(failure.timer);
                failures.delete(key);
            }
        }
    }

    function backendError(type: WatchError["type"], error: BackendError): WatchError {
        return { type, path: error.path, cause: error };
    }

    /**
     * Retries `path` through the tree as it is by then: listing its nearest watched ancestor (or itself) again,
     * or resolving its root. Nodes captured at the time of failure may have been replaced since.
     */
    function retryPath(path: AbsolutePath): void {
        const root = rootStates.get(path) ?? rootStates.values().find(r => isWithin(path, r.path));
        if (root === undefined) {
            return;
        }
        const node = path === root.path ? null : findNode(path);
        if (node === null) {
            scheduleResolve(root, true, true);
        } else {
            scheduleRescan(node, false);
        }
    }

    async function visit(
        node: DirNode,
        entries: ReadonlyMap<FileName, EntryKind>,
        ignorer = node.ignorer,
    ): Promise<IgnoreScope> {
        const signal = node.controller.signal;
        try {
            return await ignorer.visit({
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

    /** Whether `node` moved since `path` and `moves` were taken, so what was read through `path` is stale. */
    function movedSince(node: DirNode, path: AbsolutePath, moves: number): boolean {
        return node.orphaned || node.moves !== moves || node.path !== path;
    }

    /** Lists `node`, applies ignore rules and reconciles subdirectory watches. */
    async function populate(node: DirNode, reportNew: boolean): Promise<void> {
        const signal = node.controller.signal;
        const { path, moves } = node;
        // Names arriving after this point are handled by the rescan they schedule.
        const pendingNames = node.pendingNames;
        node.pendingNames = new Set();
        // A deletion before this point fails the listing; one after it sets this again.
        node.maybeDeleted = false;
        const stale = () => {
            // Listed again once adopted where it moved to, if it is.
            pendingNames.forEach(name => node.pendingNames.add(name));
            node.rescanPending = true;
        };
        const listed = await limit(() => backend.readdir(path, signal));
        // Events queued before the listing completed are handled first. A move among them orphans the node, as
        // the listing may be of whatever is at its old path by now.
        await nextMacrotask();
        if (signal.aborted) {
            return;
        }
        if (movedSince(node, path, moves)) {
            stale();
            return;
        }
        if (isErr(listed)) {
            const error = unwrap(listed);
            const root = node.parent === null ? rootStates.get(node.path) : undefined;
            if (error.type !== "not-found") {
                failed(node.path, node.path, backendError("readdir-failed", error), () => retryPath(node.path));
            } else if (root === undefined) {
                // Its parent reports the removal.
                detach(node);
            } else if (node.listed) {
                scheduleResolve(root, true);
            } else {
                // Gone right after being resolved as a directory. Bounded, in case that keeps happening.
                failed(node.path, node.path, backendError("readdir-failed", error), () => retryPath(node.path));
            }
            return;
        }
        node.listed = true;
        succeeded(node.path);
        const entries = unwrap(listed);
        const scope = await visit(node, entries);
        if (signal.aborted) {
            return;
        }
        if (movedSince(node, path, moves)) {
            stale();
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
            if (kind !== "directory" || node.ignored.has(name) || node.children.has(name)) {
                continue;
            }
            const child = join(node.path, name);
            if (failures.size === 0 || !blocked(child)) {
                crawls.push(
                    orphans.size > 0 ? adoptOrCrawl(child, node, name, reportNew) : crawl(child, node, name, reportNew),
                );
            }
        }
        if (node.id === null && node.parent !== null && node.children.size + crawls.length > 0) {
            crawls.push(identify(node));
        }
        await Promise.all(crawls);
    }

    /** Records the identity of `node`, so it can be found again if moved. */
    async function identify(node: DirNode): Promise<void> {
        const signal = node.controller.signal;
        const { path, moves } = node;
        const statted = await backend.lstat(path, signal);
        // As for listings. Were the directory replaced after its watch was registered, the event orphaning or
        // detaching the node is handled first, so the node never takes on the replacement's identity.
        await nextMacrotask();
        if (signal.aborted || movedSince(node, path, moves) || isErr(statted)) {
            return;
        }
        const stat = unwrap(statted);
        if (stat?.kind === "directory") {
            node.id = stat.id;
        }
    }

    /** Keeps the watches of a subtree that was moved away, in case it reappears within a root. */
    function orphan(node: DirNode): void {
        if (node.name !== null && node.parent?.children.get(node.name) === node) {
            node.parent.children.delete(node.name);
        }
        const previous = orphans.get(node.id!);
        if (previous !== undefined && previous !== node) {
            teardown(previous);
        }
        orphans.set(node.id!, node);
        node.expectSelf = true;
        const mark = (n: DirNode) => {
            n.orphaned = true;
            n.moves++;
            n.suspect ||= n.rescanRunning;
            n.children.forEach(mark);
        };
        mark(node);
    }

    /**
     * Watches a directory found at `path`: the orphan that moved there if its identity matches one, otherwise
     * it is crawled.
     */
    async function adoptOrCrawl(path: AbsolutePath, parent: DirNode, name: FileName, isNew: boolean): Promise<void> {
        const token = { valid: true };
        (parent.adopting ??= new Map()).set(name, token);
        const { path: parentPath, moves } = parent;
        const statted = await backend.lstat(path, parent.controller.signal);
        // Lets a `rename` of `name` queued before the stat completed invalidate the token.
        await nextMacrotask();
        if (parent.adopting?.get(name) === token) {
            parent.adopting.delete(name);
            if (parent.adopting.size === 0) {
                parent.adopting = null;
            }
        }
        if (
            closeReason !== null || parent.controller.signal.aborted || movedSince(parent, parentPath, moves)
            || parent.children.has(name)
        ) {
            // Whoever moved or detached the parent lists it again, or another listing got there first.
            return;
        }
        const stat = token.valid && !isErr(statted) ? unwrap(statted) : null;
        const found = stat?.kind === "directory" ? orphans.get(stat.id) : undefined;
        if (found === undefined || found.controller.signal.aborted) {
            return crawl(path, parent, name, isNew);
        }
        orphans.delete(stat!.id);
        found.parent = parent;
        found.name = name;
        parent.children.set(name, found);
        await relocate(found, parent.childIgnorer, true);
    }

    /**
     * Moves `node` (whose parent and name are already updated) and its subtree to their new paths. Ignore rules
     * are applied again only where the ignorer cannot vouch that the move makes no difference, using the last
     * listings rather than listing again.
     */
    async function relocate(node: DirNode, ignorer: Ignorer, isMoved: boolean): Promise<void> {
        const from: DirectoryLocation = { path: node.path, relative: node.relative };
        node.path = join(node.parent!.path, node.name!);
        node.relative = joinRelative(node.parent!.relative, node.name!);
        const to: DirectoryLocation = { path: node.path, relative: node.relative };
        if (isMoved) {
            recordSubtree(node.path);
        }
        if (node.suspect) {
            // Crawled afresh.
            detach(node);
            scheduleRescan(node.parent!, false);
            return;
        }
        const crawls: Promise<void>[] = [];
        const unchanged = node.ignorer === ignorer && isRelocatable(node.ignorer, from, to)
            && (node.childIgnorer === node.ignorer || isRelocatable(node.childIgnorer, from, to));
        if (!unchanged) {
            const moves = node.moves;
            const scope = await visit(node, node.entries, ignorer);
            if (node.controller.signal.aborted || node.moves !== moves) {
                // Moved again meanwhile; its subtree is relocated once adopted again.
                return;
            }
            node.ignorer = ignorer;
            node.ignored = scope.ignored;
            node.childIgnorer = scope.child ?? ignorer;
            for (const [name, child] of node.children) {
                if (node.ignored.has(name)) {
                    detach(child);
                }
            }
            for (const [name, kind] of node.entries) {
                if (kind === "directory" && !node.ignored.has(name) && !node.children.has(name)) {
                    crawls.push(crawl(join(node.path, name), node, name, true));
                }
            }
        }
        node.orphaned = false;
        node.expectSelf = false;
        if (node.missed) {
            node.missed = false;
            recordSubtree(node.path);
        }
        startRescans(node);
        await Promise.all([
            ...crawls,
            ...[...node.children.values()].filter(child => child.orphaned).map(child =>
                relocate(child, node.childIgnorer, false)
            ),
        ]);
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
            listed: false,
            ignored: new Set(),
            childIgnorer: ignorer,
            // The initial populate counts as a rescan, so events during it queue one more.
            rescanRunning: true,
            rescanPending: false,
            rescanDeep: false,
            id: null,
            watchedAs: name,
            orphaned: false,
            moves: 0,
            suspect: false,
            missed: false,
            expectSelf: false,
            maybeDeleted: false,
            adopting: null,
        };
        const watched = backend.watch(path, event => onRaw(node, event), node.controller.signal);
        if (isErr(watched)) {
            node.controller.abort();
            const error = unwrap(watched);
            // A vanished subdirectory is reported by its parent. A vanished root was just resolved as a
            // directory, so is retried like any other failure in case that keeps happening.
            if (error.type !== "not-found" || parent === null) {
                failed(path, path, backendError("watch-failed", error), () => retryPath(path));
            } else {
                // Unless the parent itself moved since it was listed, which it may only be told of later.
                scheduleRescan(parent, false);
            }
            return Promise.resolve();
        }
        if (node.controller.signal.aborted) {
            // Lost while registering; a retry is scheduled.
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
        if (
            node.rescanPending && !node.rescanRunning && !node.orphaned && !node.controller.signal.aborted
            && closeReason === null && (failures.size === 0 || !blocked(node.path))
        ) {
            node.rescanRunning = true;
            // Deferred until every event from the same read is handled. That coalesces them, and lets a
            // parent detach a removed directory before it is listed.
            track(nextMacrotask().then(() => runRescans(node)), true);
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
            while (
                node.rescanPending && !node.orphaned && !node.controller.signal.aborted && !blocked(node.path)
            ) {
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
        if (node.orphaned) {
            onOrphanEvent(node, event);
            return;
        }
        if (event.type === "lost") {
            // Anything may have changed while unwatched. Re-watched later, never straight away.
            recordSubtree(node.path);
            detach(node);
            failed(
                node.path,
                node.path,
                { type: "watch-lost", path: node.path, cause: event.cause },
                () => retryPath(node.path),
            );
            return;
        }
        const { type, name } = event;
        if (name === null) {
            recordSubtree(node.path);
            scheduleRescan(node, false);
            return;
        }
        if (type === "rename" && name === node.watchedAs) {
            node.maybeDeleted = true;
        }
        if (node.ignorer.triggers?.has(name)) {
            // Ignore rules for this subtree may have changed.
            recordSubtree(node.path);
            scheduleRescan(node, true);
            return;
        }
        if (node.ignored.has(name)) {
            // Rules may depend on the kind of entry, which only a `rename` (creation, removal) can change.
            if (type === "rename") {
                node.pendingNames.add(name);
                scheduleRescan(node, false);
            }
            return;
        }
        if (!node.entries.has(name)) {
            node.pendingNames.add(name);
            scheduleRescan(node, false);
            return;
        }
        if (type === "rename") {
            // The directory may have been replaced, and an old watch keeps following the original.
            const child = node.children.get(name);
            if (child !== undefined) {
                recordSubtree(child.path);
                if (child.id !== null && !child.rescanRunning && !child.maybeDeleted) {
                    // Moved, as far as can be told. Kept watched in case it moved within a root.
                    orphan(child);
                    checkOrphans();
                } else {
                    detach(child);
                }
            } else {
                const adopting = node.adopting?.get(name);
                if (adopting !== undefined) {
                    adopting.valid = false;
                }
                recordPath(join(node.path, name));
            }
            scheduleRescan(node, false);
        } else {
            recordPath(join(node.path, name));
        }
    }

    /** Events in a moved subtree only mark what to list again, should it be adopted. */
    function onOrphanEvent(node: DirNode, event: RawEvent): void {
        const isSelf = event.type === "rename" && event.name === node.watchedAs;
        if (isSelf && node.expectSelf) {
            // The move itself.
            node.expectSelf = false;
            return;
        }
        if (event.type === "lost" || isSelf) {
            // Lost, or likely deleted (see `maybeDeleted`): crawled afresh by its parent, if it is adopted.
            if (node.id !== null && orphans.get(node.id) === node) {
                orphans.delete(node.id);
            }
            detach(node);
            if (node.parent?.orphaned === true) {
                node.parent.rescanPending = true;
            }
            return;
        }
        node.rescanPending = true;
        // A listing would not show what changed in an existing file, and the subtree reported on adoption may be
        // delivered before this node is in place.
        node.missed = true;
        if (event.name !== null && node.ignorer.triggers?.has(event.name)) {
            node.rescanDeep = true;
        }
    }

    async function nearestDirectory(
        start: AbsolutePath | null,
        signal: AbortSignal,
    ): Promise<Result<AbsolutePath | null, BackendError>> {
        for (let dir = start; dir !== null && !signal.aborted; dir = parent(dir)) {
            const result = await backend.stat(dir, signal);
            if (isErr(result) || unwrap(result)?.kind === "directory") {
                return isErr(result) ? result : ok(dir);
            }
        }
        return ok(null);
    }

    function moveAnchor(root: RootState, dir: AbsolutePath | null, real: AbsolutePath | null): void {
        root.anchor?.controller.abort();
        if (dir === null) {
            root.anchor = null;
            return;
        }
        const controller = new AbortController();
        root.anchor = { dir, real, controller };
        const next = nextSegment(dir, root.path);
        const self = selfName(dir);
        const isParent = parent(root.path) === dir;
        // Kept in place while it is down, so resolving does not re-register it straight away. `missed` when it
        // was working, so the root may have been replaced unseen; otherwise checking it is unchanged suffices.
        const retryAnchor = (error: WatchError, missed: boolean) => {
            controller.abort();
            failed(anchorKey(root), root.path, error, () => {
                // Whichever anchor is current by now; a dead one is replaced.
                if (root.anchor?.controller.signal.aborted) {
                    root.anchor = null;
                }
                scheduleResolve(root, missed, true);
            });
        };
        const watched = backend.watch(dir, event => {
            if (closeReason !== null || controller.signal.aborted) {
                return;
            }
            if (event.type === "lost") {
                retryAnchor({ type: "watch-lost", path: dir, cause: event.cause }, true);
                return;
            }
            if (event.name === null) {
                // Could be anything, including the root being replaced.
                scheduleResolve(root, true);
                return;
            }
            if (event.name !== next) {
                if (event.name === self) {
                    // The anchor was removed or moved (its watch follows the moved directory), so is replaced.
                    // The root's tree is replaced only if the root changed.
                    if (root.anchor?.controller === controller) {
                        controller.abort();
                        root.anchor = null;
                    }
                    scheduleResolve(root, false);
                }
                return;
            }
            if (event.type === "change" && isParent && root.kind !== "pending") {
                // Content of a file root. A directory root's own metadata is not of interest.
                if (root.kind === "file") {
                    recordPath(root.path);
                }
                return;
            }
            scheduleResolve(root, true);
        }, controller.signal);
        if (isErr(watched)) {
            retryAnchor(backendError("watch-failed", unwrap(watched)), false);
            return;
        }
        if (controller.signal.aborted) {
            // Lost while registering.
            return;
        }
        succeeded(anchorKey(root));
        // Moving any directory above the anchor moves the root, but only the directory holding the moved one
        // sees it, so each is watched. So is the way to where a symlink root leads. Best effort: one that cannot
        // be watched (e.g. not readable) is skipped, as it only matters if it is moved.
        for (const [ancestor, names] of ancestorsOf(dir, real)) {
            if (controller.signal.aborted) {
                break;
            }
            const ancestorSelf = selfName(ancestor);
            backend.watch(ancestor, event => {
                if (closeReason !== null || controller.signal.aborted) {
                    return;
                }
                if (event.type === "lost") {
                    retryAnchor({ type: "watch-lost", path: ancestor, cause: event.cause }, false);
                } else if (event.name === null || names.has(event.name) || event.name === ancestorSelf) {
                    // Only where the root is can change from up here; its own watches see what happens inside.
                    scheduleResolve(root, false);
                }
            }, controller.signal);
        }
    }

    /**
     * Finds what is at the root now, re-anchors it and (re)starts watching it. Unless `full`, a root found
     * unchanged (same kind and identity) is left as it is.
     */
    async function resolveRoot(root: RootState, report: boolean, full: boolean): Promise<void> {
        const signal = closedSignal;
        for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt++) {
            const retryLater = (error: BackendError) =>
                failed(
                    root.path,
                    root.path,
                    backendError("stat-failed", error),
                    () => scheduleResolve(root, true, true),
                );
            const statted = config.followRootSymlinks
                ? await backend.stat(root.path, signal)
                : await backend.lstat(root.path, signal);
            if (signal.aborted) {
                return;
            }
            if (isErr(statted)) {
                retryLater(unwrap(statted));
                return;
            }
            const stat: Stat | null = unwrap(statted);
            let anchor = parent(root.path);
            if (stat === null) {
                const nearest = await nearestDirectory(anchor, signal);
                if (signal.aborted) {
                    return;
                }
                if (isErr(nearest)) {
                    retryLater(unwrap(nearest));
                    return;
                }
                anchor = unwrap(nearest);
            }
            let real: AbsolutePath | null = null;
            if (stat !== null) {
                // Where the root actually is, in case a symlink leads there. Not followed beyond the root's own
                // directory unless root symlinks are.
                const dir = parent(root.path);
                const target = config.followRootSymlinks || dir === null ? root.path : dir;
                const resolved = await backend.realpath(target, signal);
                if (signal.aborted) {
                    return;
                }
                if (isErr(resolved)) {
                    retryLater(unwrap(resolved));
                    return;
                }
                const path = unwrap(resolved);
                const located = path === null || target === root.path
                    ? path
                    : join(path, nextSegment(target, root.path) as FileName);
                real = located === root.path ? null : located;
            }
            if (anchor !== (root.anchor?.dir ?? null) || real !== (root.anchor?.real ?? null)) {
                moveAnchor(root, anchor, real);
                // Look again, as the root may have changed before the anchor was in place.
                continue;
            }
            const kind = stat === null ? "pending" : stat.kind === "directory" ? "directory" : "file";
            const tree = roots.get(root.path);
            const unchanged = stat !== null && stat.id === root.id && kind === root.kind;
            if (!full && unchanged && (kind === "file" || tree !== undefined)) {
                if (kind === "file" && report) {
                    // The event may have hidden a change to a file root's content.
                    recordPath(root.path);
                }
                return;
            }
            if (tree !== undefined) {
                // Removed or replaced; its watches would keep following the original directory.
                detach(tree);
            }
            if (report && (root.kind !== "pending" || kind !== "pending")) {
                if (root.kind === "directory") {
                    recordSubtree(root.path);
                } else {
                    recordPath(root.path);
                }
            }
            root.kind = kind;
            root.id = stat?.id ?? null;
            if (root.kind === "directory") {
                // Succeeds once its first listing does.
                await crawl(root.path, null, null, report);
            } else {
                succeeded(root.path);
            }
            return;
        }
        const error = new Error("The root kept changing while resolving it");
        failed(root.path, root.path, { type: "watch-failed", path: root.path, cause: error }, () => {
            scheduleResolve(root, true, true);
        });
    }

    async function runResolves(root: RootState, report: boolean): Promise<void> {
        try {
            do {
                const { resolveFull: full, resolveForced: forced } = root;
                root.resolvePending = false;
                root.resolveFull = false;
                root.resolveForced = false;
                // While its failures back off, only their retries (or an explicit rescan) may try again.
                if (forced || !blocked(root.path)) {
                    await resolveRoot(root, report, full);
                }
                report = true;
            } while (root.resolvePending && closeReason === null);
        } finally {
            root.resolveRunning = false;
        }
    }

    /** `full` when the root may have been replaced; otherwise it is only verified. */
    function scheduleResolve(root: RootState, full: boolean, forced = false): void {
        root.resolvePending = true;
        root.resolveFull ||= full;
        root.resolveForced ||= forced;
        if (!root.resolveRunning && closeReason === null) {
            root.resolveRunning = true;
            track(nextMacrotask().then(() => runResolves(root, true)), true);
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
            closedController.abort();
            for (const root of roots.values()) {
                teardown(root);
            }
            roots.clear();
            discardOrphans();
            for (const root of rootStates.values()) {
                root.anchor?.controller.abort();
            }
            for (const failure of failures.values()) {
                clearTimeout(failure.timer);
            }
            failures.clear();
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
    const initial = topRoots.map(path => {
        const root: RootState = {
            path,
            kind: "pending",
            id: null,
            anchor: null,
            resolveRunning: true,
            resolvePending: false,
            resolveFull: true,
            resolveForced: true,
        };
        rootStates.set(path, root);
        return runResolves(root, false);
    });
    track(
        Promise.all(initial).then(() => {
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
                    // Stay suspended until the tree reflects what happened, so nothing leaks out early. Failures
                    // backing off are retried now rather than waited for, until they recover or run out of
                    // attempts (so this is bounded).
                    if (suspendCount === 1) {
                        do {
                            await drain(rescans);
                        } while (retryNow() && closeReason === null);
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
            forgetFailures(scope);
            if (scope === undefined) {
                for (const root of rootStates.values()) {
                    if (root.kind !== "directory" || !roots.has(root.path)) {
                        scheduleResolve(root, true, true);
                    }
                }
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
