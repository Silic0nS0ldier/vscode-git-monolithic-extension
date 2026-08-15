import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

/**
 * Wraps `git rev-parse --show-cdup`, the relative path from `cwd` up to the top of the
 * work tree.
 *
 * Empty at the top of a work tree, and also in a bare repository or a git directory, where
 * there is no work tree at all.
 * @todo Callers distinguishing those cases want `rev-parse --is-bare-repository` instead.
 */
export async function showCdup(
    git: GitContext,
    cwd: string,
): Promise<Result<string, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["rev-parse", "--show-cdup"]);

    if (isErr(result)) {
        return result;
    }

    // Keep trailing spaces which are part of the directory names
    return ok(unwrap(result).replace(/[\r\n]+$/, ""));
}
