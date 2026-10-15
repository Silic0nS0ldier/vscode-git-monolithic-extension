import { err, ok, type Result } from "monolithic-git-interop/util/result";
import path from "node:path";

declare const brand: unique symbol;
/** Nominal typing for primitives. Erased at runtime. */
export type Brand<T, Tag extends string> = T & { readonly [brand]: Tag };

/** Normalised absolute path with `/` separators and no trailing separator (except for a root). */
export type AbsolutePath = Brand<string, "AbsolutePath">;
/** Path relative to a watch root with `/` separators. Never empty, never escapes the root. */
export type RelativePath = Brand<string, "RelativePath">;
/** A single path segment. */
export type FileName = Brand<string, "FileName">;

export type EntryKind = "file" | "directory" | "symlink" | "other";

export type PathError = {
    readonly type: "invalid-path";
    readonly input: string;
    readonly reason: string;
};

const WINDOWS_ROOT = /^[A-Za-z]:\//;

export function absolutePath(raw: string): Result<AbsolutePath, PathError> {
    const slashed = raw.replaceAll("\\", "/");
    if (!slashed.startsWith("/") && !WINDOWS_ROOT.test(slashed)) {
        return err({ type: "invalid-path", input: raw, reason: "not absolute" });
    }
    let normalised = path.posix.normalize(slashed);
    if (normalised.length > 1 && normalised.endsWith("/") && !/^[A-Za-z]:\/$/.test(normalised)) {
        normalised = normalised.slice(0, -1);
    }
    return ok(normalised as AbsolutePath);
}

export function fileName(raw: string): Result<FileName, PathError> {
    if (raw === "" || raw === "." || raw === "..") {
        return err({ type: "invalid-path", input: raw, reason: "not a file name" });
    }
    if (raw.includes("/") || raw.includes("\\") || raw.includes("\0")) {
        return err({ type: "invalid-path", input: raw, reason: "contains a separator" });
    }
    return ok(raw as FileName);
}

export function join(dir: AbsolutePath, name: FileName): AbsolutePath {
    return (dir.endsWith("/") ? dir + name : `${dir}/${name}`) as AbsolutePath;
}

export function joinRelative(dir: RelativePath | null, name: FileName): RelativePath {
    return (dir === null ? name : `${dir}/${name}`) as RelativePath;
}

const COLON = 58;

/** `null` for a root. */
export function parent(target: AbsolutePath): AbsolutePath | null {
    const index = target.lastIndexOf("/");
    if (index === target.length - 1) {
        return null;
    }
    if (index === 0) {
        return "/" as AbsolutePath;
    }
    // Keep the separator of a drive root (`C:/`).
    const end = index === 2 && target.charCodeAt(1) === COLON ? 3 : index;
    return target.slice(0, end) as AbsolutePath;
}

/** Whether `target` is strictly inside `dir`. */
export function isWithin(target: AbsolutePath, dir: AbsolutePath): boolean {
    const prefix = dir.endsWith("/") ? dir : dir + "/";
    return target.length > prefix.length && target.startsWith(prefix);
}
