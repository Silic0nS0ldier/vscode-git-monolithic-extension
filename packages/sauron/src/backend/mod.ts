import type { Result } from "monolithic-git-interop/util/result";
import type { AbsolutePath, EntryKind, FileName } from "../path.js";

/**
 * What a platform watcher reports for a watched directory. `name` is the affected entry when known.
 * `rename` covers creation, deletion and moves; `change` covers content and metadata. `lost` means the watch
 * has stopped (e.g. it errored) and nothing more will arrive from it.
 */
export type RawEvent =
    | { readonly type: "rename" | "change"; readonly name: FileName | null }
    | { readonly type: "lost"; readonly cause: unknown };

export type Stat = {
    readonly kind: EntryKind;
    /** Identifies the entry while it exists (device and inode). May be reused once it is gone. */
    readonly id: string;
};

export type BackendError = {
    /** `limit` covers watch/descriptor exhaustion (`ENOSPC`, `EMFILE`). */
    readonly type: "not-found" | "limit" | "other";
    readonly path: AbsolutePath;
    readonly cause: unknown;
};

/**
 * Platform abstraction. Implementations must not throw.
 * Watches are non-recursive; the watcher crawls and registers one per directory.
 */
export type Backend = {
    /** Watches `dir` until `signal` aborts. */
    watch(dir: AbsolutePath, listener: (event: RawEvent) => void, signal: AbortSignal): Result<void, BackendError>;
    readdir(dir: AbsolutePath, signal: AbortSignal): Promise<Result<ReadonlyMap<FileName, EntryKind>, BackendError>>;
    /** Follows symlinks. `null` when nothing exists at `target` (including a dangling symlink or a loop). */
    stat(target: AbsolutePath, signal: AbortSignal): Promise<Result<Stat | null, BackendError>>;
    /** Like {@link stat}, but a symlink is reported as one rather than followed. */
    lstat(target: AbsolutePath, signal: AbortSignal): Promise<Result<Stat | null, BackendError>>;
    /** What the symlink at `target` contains. `null` when nothing is there, or it is not a symlink. */
    readlink(target: AbsolutePath, signal: AbortSignal): Promise<Result<string | null, BackendError>>;
    /** Resolves every symlink in `target`. `null` when nothing exists there (including a dangling symlink). */
    realpath(target: AbsolutePath, signal: AbortSignal): Promise<Result<AbsolutePath | null, BackendError>>;
    /**
     * `null` unless `file` is a regular file. Never follows symlinks (as git does for `.gitignore`), and never
     * opens FIFOs, sockets or devices, which could block or never end.
     */
    readText(file: AbsolutePath, signal: AbortSignal): Promise<Result<string | null, BackendError>>;
};
