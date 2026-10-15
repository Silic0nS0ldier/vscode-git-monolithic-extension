import { err, isErr, ok, unwrap } from "monolithic-git-interop/util/result";
import { type AbsolutePath, absolutePath, type EntryKind, type FileName, parent } from "../path.js";
import type { Backend, BackendError, RawEvent } from "./mod.js";

type Entry = { readonly kind: "directory" } | { readonly kind: "file"; content: string };

export type FakeBackend = Backend & {
    mkdir(path: string): void;
    write(path: string, content?: string): void;
    remove(path: string): void;
    /** Directories with an active watch. */
    readonly watched: ReadonlySet<AbsolutePath>;
    /** Number of watches ever registered per directory. */
    readonly watchCalls: ReadonlyMap<AbsolutePath, number>;
    /** Makes `watch` fail for matching directories. */
    failWatch: ((dir: AbsolutePath) => BackendError["type"] | null) | null;
};

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
    const entries = new Map<AbsolutePath, Entry>([[p("/"), { kind: "directory" }]]);
    const listeners = new Map<AbsolutePath, Set<(event: RawEvent) => void>>();
    const watchCalls = new Map<AbsolutePath, number>();

    function emit(target: AbsolutePath, type: RawEvent["type"]): void {
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
        entries.set(target, { kind: "directory" });
        emit(target, "rename");
    }

    const backend: FakeBackend = {
        failWatch: null,
        get watched() {
            return new Set(listeners.entries().filter(([, set]) => set.size > 0).map(([dir]) => dir));
        },
        watchCalls,
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
            entries.set(target, { kind: "file", content });
            emit(target, "rename");
        },
        remove(raw) {
            const target = p(raw);
            const prefix = target + "/";
            for (const key of entries.keys()) {
                if (key === target || key.startsWith(prefix)) {
                    entries.delete(key);
                }
            }
            emit(target, "rename");
        },
        watch(dir, listener, signal) {
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
            return ok(undefined);
        },
        async readdir(dir) {
            await new Promise(resolve => setImmediate(resolve));
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
        async readText(file) {
            await new Promise(resolve => setImmediate(resolve));
            const entry = entries.get(file);
            return ok(entry?.kind === "file" ? entry.content : null);
        },
    };
    return backend;
}
