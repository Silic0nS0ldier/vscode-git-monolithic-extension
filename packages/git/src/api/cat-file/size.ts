import { from_str_radix } from "monolithic-git-wasm";
import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

/**
 * Size in bytes of an object in the database.
 * Wraps `git cat-file -s <object>`.
 *
 * The size is parsed as a `u32`, so an object of 4GiB or more is reported as an error
 * rather than a truncated number.
 */
export async function size(
    git: GitContext,
    cwd: string,
    object: string,
): Promise<Result<number, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["cat-file", "-s", object]);

    if (isErr(result)) {
        return result;
    }

    const raw = unwrap(result).trim();

    try {
        return ok(from_str_radix(raw, 10));
    } catch (e) {
        return err(createError(ERROR_GENERIC, `Could not parse the size of "${object}" from "${raw}": ${e}`));
    }
}
