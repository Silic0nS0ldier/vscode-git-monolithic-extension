import { Readable } from "node:stream";
import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

/** Wraps `git hash-object -t tree --stdin` with empty stdin, respecting the repository's object format. */
export async function emptyTree(
    git: GitContext,
    cwd: string,
    signal?: AbortSignal,
): Promise<Result<string, ReadToErrors>> {
    const result = await readToString(
        { cli: git.cli, cwd, stdin: Readable.from([]), signal },
        ["hash-object", "-t", "tree", "--stdin"],
    );
    if (isErr(result)) return result;
    const hash = unwrap(result).trim();
    return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(hash)
        ? ok(hash)
        : err(createError(ERROR_GENERIC, "Invalid empty-tree object id"));
}
