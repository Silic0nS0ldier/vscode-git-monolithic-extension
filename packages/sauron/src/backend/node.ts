import { err, isOk, ok, type Result, unwrap } from "monolithic-git-interop/util/result";
import fs from "node:fs";
import { type AbsolutePath, absolutePath, type EntryKind, type FileName, fileName } from "../path.js";
import type { Backend, BackendError, Stat } from "./mod.js";

// The flags are undefined where unsupported (Windows), where neither FIFOs nor these devices are a concern.
const { O_RDONLY, O_NONBLOCK, O_NOFOLLOW } = fs.constants as Partial<typeof fs.constants>;
const OPEN_REGULAR = (O_RDONLY ?? 0) | (O_NONBLOCK ?? 0) | (O_NOFOLLOW ?? 0);

function errorCode(cause: unknown): string | undefined {
    return (cause as NodeJS.ErrnoException | null)?.code;
}

function toBackendError(path: AbsolutePath, cause: unknown): BackendError {
    const code = errorCode(cause);
    switch (code) {
        case "ENOENT":
        case "ENOTDIR":
            return { type: "not-found", path, cause };
        case "ENOSPC":
        case "EMFILE":
        case "ENFILE":
            return { type: "limit", path, cause };
        default:
            return { type: "other", path, cause };
    }
}

function kindOf(entry: Pick<fs.Dirent, "isDirectory" | "isFile" | "isSymbolicLink">): EntryKind {
    if (entry.isDirectory()) {
        return "directory";
    }
    if (entry.isFile()) {
        return "file";
    }
    if (entry.isSymbolicLink()) {
        return "symlink";
    }
    return "other";
}

async function statEntry(
    target: AbsolutePath,
    signal: AbortSignal,
    follow: boolean,
): Promise<Result<Stat | null, BackendError>> {
    try {
        signal.throwIfAborted();
        const options = { bigint: true } as const;
        const stats = follow ? await fs.promises.stat(target, options) : await fs.promises.lstat(target, options);
        return ok({ kind: kindOf(stats), id: `${stats.dev}:${stats.ino}` });
    } catch (e) {
        const error = toBackendError(target, e);
        // A symlink loop resolves to nothing, like a dangling symlink.
        return error.type === "not-found" || errorCode(e) === "ELOOP" ? ok(null) : err(error);
    }
}

/**
 * Backend built on `node:fs`. Uses one non-recursive `fs.watch` per directory, because Node's
 * `recursive: true` is emulated in userland on Linux and watches every file.
 */
export function createNodeBackend(): Backend {
    return {
        watch(dir, listener, signal) {
            try {
                const watcher = fs.watch(dir, { encoding: "utf8", persistent: true, recursive: false, signal });
                watcher.on("change", (type, name) => {
                    const parsed = typeof name === "string" ? fileName(name) : null;
                    listener({
                        type: type === "rename" ? "rename" : "change",
                        name: parsed !== null && isOk(parsed) ? unwrap(parsed) : null,
                    });
                });
                // Node closes the handle on error, so the watch is gone.
                watcher.on("error", cause => {
                    watcher.close();
                    listener({ type: "lost", cause });
                });
                return ok(undefined);
            } catch (e) {
                return err(toBackendError(dir, e));
            }
        },
        async readdir(dir, signal) {
            try {
                signal.throwIfAborted();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const result = new Map<FileName, EntryKind>();
                for (const entry of entries) {
                    const name = fileName(entry.name);
                    if (isOk(name)) {
                        result.set(unwrap(name), kindOf(entry));
                    }
                }
                return ok(result);
            } catch (e) {
                return err(toBackendError(dir, e));
            }
        },
        stat: (target, signal) => statEntry(target, signal, true),
        lstat: (target, signal) => statEntry(target, signal, false),
        async realpath(target, signal) {
            try {
                signal.throwIfAborted();
                const resolved = absolutePath(await fs.promises.realpath(target));
                return isOk(resolved)
                    ? ok(unwrap(resolved))
                    : err({ type: "other", path: target, cause: unwrap(resolved) });
            } catch (e) {
                const error = toBackendError(target, e);
                return error.type === "not-found" || errorCode(e) === "ELOOP" ? ok(null) : err(error);
            }
        },
        async readText(file, signal) {
            let handle: fs.promises.FileHandle | undefined;
            try {
                signal.throwIfAborted();
                // Opening a FIFO blocks and a device may never stop reading (or act on being opened), so only
                // regular files are opened. Non-blocking and not following symlinks in case it was replaced since.
                if (!(await fs.promises.lstat(file)).isFile()) {
                    return ok(null);
                }
                handle = await fs.promises.open(file, OPEN_REGULAR);
                if (!(await handle.stat()).isFile()) {
                    return ok(null);
                }
                return ok(await handle.readFile({ encoding: "utf8", signal }));
            } catch (e) {
                const error = toBackendError(file, e);
                // ELOOP: replaced by a symlink. ENXIO: replaced by a socket.
                const code = errorCode(e);
                return error.type === "not-found" || code === "ELOOP" || code === "ENXIO" ? ok(null) : err(error);
            } finally {
                await handle?.close().catch(() => {});
            }
        },
    };
}
