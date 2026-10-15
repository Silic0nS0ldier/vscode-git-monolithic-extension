import { err, isErr, ok, unwrap } from "monolithic-git-interop/util/result";
import { type AbsolutePath, absolutePath, type EntryKind, type FileName, parent } from "../path.js";
import type { Backend, BackendError, RawEvent } from "./mod.js";

type Entry = { readonly kind: "directory"; readonly id: string } | {
    readonly kind: "file";
    readonly id: string;
    content: string;
};

export type FakeBackend = Backend & {
    mkdir(path: string): void;
    write(path: string, content?: string): void;
    remove(path: string): void;
    /** Directories with an active watch. */
    readonly watched: ReadonlySet<AbsolutePath>;
    /** Number of watches ever registered per directory. */
    readonly watchCalls: ReadonlyMap<AbsolutePath, number>;
    /** Number of `stat` calls so far. */
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
        async stat(target) {
            statCalls++;
            await new Promise(resolve => setImmediate(resolve));
            const failure = backend.failStat?.(target) ?? null;
            if (failure !== null) {
                return err({ type: failure, path: target, cause: new Error(`injected ${failure}`) });
            }
            const entry = entries.get(target);
            return ok(entry === undefined ? null : { kind: entry.kind, id: entry.id });
        },
        async readText(file) {
            await new Promise(resolve => setImmediate(resolve));
            const entry = entries.get(file);
            return ok(entry?.kind === "file" ? entry.content : null);
        },
    };
    return backend;
}
