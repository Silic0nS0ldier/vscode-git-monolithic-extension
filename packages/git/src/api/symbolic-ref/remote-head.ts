import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

/**
 * The remote's default branch, as the remote names it (e.g. `refs/heads/main`), going by
 * what `refs/remotes/<remote>/HEAD` points at. `undefined` when that is unset, as it is
 * for a remote added rather than cloned from until `git remote set-head` runs.
 *
 * Wraps `git symbolic-ref --quiet refs/remotes/<remote>/HEAD`.
 */
export async function remoteHead(
    git: GitContext,
    cwd: string,
    remote: string,
): Promise<Result<string | undefined, ReadToErrors>> {
    const prefix = `refs/remotes/${remote}/`;
    const result = await readToString({ cli: git.cli, cwd }, ["symbolic-ref", "--quiet", `${prefix}HEAD`]);

    if (isErr(result)) {
        const error = unwrap(result);
        // `--quiet` exits 1 without a message when the ref is missing or not symbolic.
        if (error.type === ERROR_NON_ZERO_EXIT && error.cause.exitCode === 1) {
            return ok(undefined);
        }
        return result;
    }

    const target = unwrap(result).trim();

    if (!target.startsWith(prefix)) {
        return ok(undefined);
    }

    return ok(`refs/heads/${target.substring(prefix.length)}`);
}
