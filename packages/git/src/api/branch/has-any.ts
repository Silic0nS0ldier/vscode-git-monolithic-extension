import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { ERROR_BUFFER_OVERFLOW } from "../../errors.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

/**
 * Only emptiness matters, so a listing that outgrows this is already known to be non-empty and
 * is not read any further.
 */
const MAX_BUFFER = 64 * 1024;

/**
 * Whether git lists any local branch. A detached `HEAD` is listed, so it counts; an unborn
 * branch is not.
 *
 * Wraps `git branch`.
 */
export async function hasAny(git: GitContext, cwd: string): Promise<Result<boolean, ReadToErrors>> {
    const result = await readToBuffer({ cli: git.cli, cwd }, ["branch"], MAX_BUFFER);

    if (isErr(result)) {
        if (unwrap(result).type === ERROR_BUFFER_OVERFLOW) {
            return ok(true);
        }
        return result;
    }

    return ok(unwrap(result).length > 0);
}
