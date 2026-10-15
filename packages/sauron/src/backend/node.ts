import { err, isOk, ok, unwrap } from "monolithic-git-interop/util/result";
import fs from "node:fs";
import { type AbsolutePath, type EntryKind, type FileName, fileName } from "../path.js";
import type { Backend, BackendError } from "./mod.js";

function toBackendError(path: AbsolutePath, cause: unknown): BackendError {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
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

function kindOf(entry: fs.Dirent): EntryKind {
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
        async stat(target, signal) {
            try {
                signal.throwIfAborted();
                const stats = await fs.promises.stat(target, { bigint: true });
                const kind = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
                return ok({ kind, id: `${stats.dev}:${stats.ino}` });
            } catch (e) {
                const error = toBackendError(target, e);
                return error.type === "not-found" ? ok(null) : err(error);
            }
        },
        async readText(file, signal) {
            try {
                return ok(await fs.promises.readFile(file, { encoding: "utf8", signal }));
            } catch (e) {
                const error = toBackendError(file, e);
                return error.type === "not-found" ? ok(null) : err(error);
            }
        },
    };
}
