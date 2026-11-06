import { err, isErr, ok, unwrap } from "monolithic-git-interop/util/result";
import { type AbsolutePath, absolutePath, type EntryKind, type FileName, parent } from "../path.js";
import type { Backend, BackendError, RawEvent } from "./mod.js";

type Entry = { readonly kind: "directory" | "symlink" | "other"; readonly id: string } | {
    readonly kind: "file";
    readonly id: string;
    content: string;
};

export type FakeBackend = Backend & {
    mkdir(path: string): void;
    write(path: string, content?: string): void;
    /** Creates a symlink (always dangling, as `stat` does not follow it) or a FIFO, socket or device. */
    special(path: string, kind: "symlink" | "other"): void;
    /** Changes an entry's metadata, e.g. its permissions. */
    touch(path: string): void;
    remove(path: string): void;
    /**
     * Moves an entry, like `rename(2)`: replaces an empty directory or a non-directory at `to`, and keeps the
     * moved directories' watches, which follow them to their new paths.
     */
    rename(from: string, to: string): void;
    /** Directories with an active watch. */
    readonly watched: ReadonlySet<AbsolutePath>;
    /** Number of watches ever registered per directory. */
    readonly watchCalls: ReadonlyMap<AbsolutePath, number>;
    /** Number of `stat` and `lstat` calls so far. */
    readonly statCalls: number;
    /** Makes `watch` fail for matching directories. */
    failWatch: ((dir: AbsolutePath) => BackendError["type"] | null) | null;
    /** Makes `readdir` fail for matching directories. */
    failReaddir: ((dir: AbsolutePath) => BackendError["type"] | null) | null;
    /** Milliseconds `readdir` takes for matching directories (default: one macrotask). */
    readdirDelay: ((dir: AbsolutePath) => number) | null;
    /** Makes `stat` fail for matching paths. */
    failStat: ((target: AbsolutePath) => BackendError["type"] | null) | null;
    /** Called after a watch is registered, e.g. to break it. */
    afterWatch: ((dir: AbsolutePath) => void) | null;
    /** Number of `watch` calls per directory, including failed ones. */
    readonly watchAttempts: ReadonlyMap<AbsolutePath, number>;
    /** Number of `readdir` calls per directory, including failed ones. */
    readonly readdirAttempts: ReadonlyMap<AbsolutePath, number>;
    /** Number of `readText` calls per path. */
    readonly readTextCalls: ReadonlyMap<AbsolutePath, number>;
    /** Ends the watches on `dir` with an error, as a platform watcher may. */
    breakWatch(dir: string): void;
    /** Emits an event without a name to the watches on `dir`. */
    emitNameless(dir: string): void;
};

function increment(counts: Map<AbsolutePath, number>, key: AbsolutePath): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function p(raw: string): AbsolutePath {
    const result = absolutePath(raw);
    if (isErr(result)) {
        throw new Error(`Invalid test path: ${raw}`);
    }
    return unwrap(result);
}

function nameOf(path: AbsolutePath): FileName {
    return path.slice(path.lastIndexOf("/") + 1) as FileName;
}

/** In-memory file system emitting events the way a non-recursive platform watcher would. */
export function createFakeBackend(): FakeBackend {
    let nextId = 0;
    const newId = () => String(nextId++);
    const entries = new Map<AbsolutePath, Entry>([[p("/"), { kind: "directory", id: newId() }]]);
    const listeners = new Map<AbsolutePath, Set<(event: RawEvent) => void>>();
    const watchCalls = new Map<AbsolutePath, number>();
    const watchAttempts = new Map<AbsolutePath, number>();
    const readdirAttempts = new Map<AbsolutePath, number>();
    const readTextCalls = new Map<AbsolutePath, number>();
    let statCalls = 0;

    function emit(target: AbsolutePath, type: "rename" | "change"): void {
        const dir = parent(target);
        if (dir === null) {
            return;
        }
        for (const listener of listeners.get(dir) ?? []) {
            listener({ type, name: nameOf(target) });
        }
    }

    function mkdir(raw: string): void {
        const target = p(raw);
        if (entries.get(target)?.kind === "directory") {
            return;
        }
        const dir = parent(target);
        if (dir !== null) {
            mkdir(dir);
        }
        entries.set(target, { kind: "directory", id: newId() });
        emit(target, "rename");
    }

    const backend: FakeBackend = {
        failWatch: null,
        failReaddir: null,
        failStat: null,
        readdirDelay: null,
        afterWatch: null,
        watchAttempts,
        readdirAttempts,
        readTextCalls,
        breakWatch(raw) {
            const dir = p(raw);
            const dead = [...listeners.get(dir) ?? []];
            listeners.delete(dir);
            for (const listener of dead) {
                listener({ type: "lost", cause: new Error("injected loss") });
            }
        },
        emitNameless(raw) {
            for (const listener of listeners.get(p(raw)) ?? []) {
                listener({ type: "rename", name: null });
            }
        },
        get watched() {
            return new Set(listeners.entries().filter(([, set]) => set.size > 0).map(([dir]) => dir));
        },
        watchCalls,
        get statCalls() {
            return statCalls;
        },
        mkdir,
        write(raw, content = "") {
            const target = p(raw);
            const existing = entries.get(target);
            if (existing?.kind === "file") {
                existing.content = content;
                emit(target, "change");
                return;
            }
            mkdir(parent(target)!);
            entries.set(target, { kind: "file", id: newId(), content });
            emit(target, "rename");
        },
        special(raw, kind) {
            const target = p(raw);
            mkdir(parent(target)!);
            const replaced = entries.has(target);
            if (replaced) {
                backend.remove(raw);
            }
            entries.set(target, { kind, id: newId() });
            emit(target, "rename");
        },
        touch(raw) {
            const target = p(raw);
            const entry = entries.get(target);
            // Like Node, which reports metadata changes to a directory as `rename` (inotify sets IN_ISDIR).
            emit(target, entry?.kind === "directory" ? "rename" : "change");
        },
        remove(raw) {
            const target = p(raw);
            const prefix = target + "/";
            const removed = [...entries.keys()].filter(key => key === target || key.startsWith(prefix));
            // Like `rm -r` and inotify: deepest first, each reported to its directory, and a watched directory
            // reports its own deletion (libuv names it after the directory itself).
            removed.sort((a, b) => b.length - a.length);
            for (const key of removed) {
                entries.delete(key);
                emit(key, "rename");
                for (const listener of listeners.get(key) ?? []) {
                    listener({ type: "rename", name: nameOf(key) });
                }
            }
        },
        rename(rawFrom, rawTo) {
            const from = p(rawFrom);
            const to = p(rawTo);
            const moved = entries.get(from);
            if (moved === undefined || entries.get(parent(to)!)?.kind !== "directory" || to.startsWith(from + "/")) {
                throw new Error(`Cannot rename ${from} to ${to}`);
            }
            const replaced = entries.get(to);
            if (replaced !== undefined) {
                const isDir = replaced.kind === "directory";
                const hasChildren = entries.keys().some(key => key.startsWith(to + "/"));
                if (isDir !== (moved.kind === "directory") || hasChildren) {
                    throw new Error(`Cannot replace ${to}`);
                }
                entries.delete(to);
                const dead = [...listeners.get(to) ?? []];
                listeners.delete(to);
                for (const listener of dead) {
                    listener({ type: "rename", name: nameOf(to) });
                }
            }
            const prefix = from + "/";
            const keys = [...entries.keys()].filter(key => key === from || key.startsWith(prefix));
            const movedListeners = keys.flatMap(key => {
                const set = listeners.get(key);
                listeners.delete(key);
                return set === undefined ? [] : [[key, set] as const];
            });
            for (const key of keys) {
                const entry = entries.get(key)!;
                entries.delete(key);
                entries.set((to + key.slice(from.length)) as AbsolutePath, entry);
            }
            for (const [key, set] of movedListeners) {
                listeners.set((to + key.slice(from.length)) as AbsolutePath, set);
            }
            // As inotify: the old name, the new name, then the moved directory itself (named as it was watched).
            emit(from, "rename");
            emit(to, "rename");
            for (const listener of listeners.get(to) ?? []) {
                listener({ type: "rename", name: nameOf(from) });
            }
        },
        watch(dir, listener, signal) {
            increment(watchAttempts, dir);
            const failure = backend.failWatch?.(dir) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: dir, cause: new Error(`injected ${failure}`) });
            }
            if (entries.get(dir)?.kind !== "directory") {
                return err({ type: "not-found", path: dir, cause: new Error("ENOENT") });
            }
            watchCalls.set(dir, (watchCalls.get(dir) ?? 0) + 1);
            let set = listeners.get(dir);
            if (set === undefined) {
                set = new Set();
                listeners.set(dir, set);
            }
            set.add(listener);
            signal.addEventListener("abort", () => set.delete(listener), { once: true });
            backend.afterWatch?.(dir);
            return ok(undefined);
        },
        async readdir(dir) {
            increment(readdirAttempts, dir);
            const delay = backend.readdirDelay?.(dir) ?? 0;
            await new Promise(resolve => delay === 0 ? setImmediate(resolve) : setTimeout(resolve, delay));
            const failure = backend.failReaddir?.(dir) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: dir, cause: new Error(`injected ${failure}`) });
            }
            if (entries.get(dir)?.kind !== "directory") {
                return err({ type: "not-found", path: dir, cause: new Error("ENOENT") });
            }
            const result = new Map<FileName, EntryKind>();
            for (const [path, entry] of entries) {
                if (path !== dir && parent(path) === dir) {
                    result.set(nameOf(path), entry.kind);
                }
            }
            return ok(result);
        },
        async lstat(target) {
            statCalls++;
            await new Promise(resolve => setImmediate(resolve));
            const failure = backend.failStat?.(target) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: target, cause: new Error(`injected ${failure}`) });
            }
            const entry = entries.get(target);
            return ok(entry === undefined ? null : { kind: entry.kind, id: entry.id });
        },
        async stat(target) {
            statCalls++;
            await new Promise(resolve => setImmediate(resolve));
            const failure = backend.failStat?.(target) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: target, cause: new Error(`injected ${failure}`) });
            }
            const entry = entries.get(target);
            if (entry === undefined || entry.kind === "symlink") {
                return ok(null);
            }
            return ok({ kind: entry.kind, id: entry.id });
        },
        async realpath(target) {
            await new Promise(resolve => setImmediate(resolve));
            const failure = backend.failStat?.(target) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: target, cause: new Error(`injected ${failure}`) });
            }
            // Symlinks are always dangling here, so only a path without any resolves.
            const kind = entries.get(target)?.kind;
            return ok(kind === undefined || kind === "symlink" ? null : target);
        },
        async readText(file) {
            increment(readTextCalls, file);
            await new Promise(resolve => setImmediate(resolve));
            const entry = entries.get(file);
            return ok(entry?.kind === "file" ? entry.content : null);
        },
    };
    return backend;
}
