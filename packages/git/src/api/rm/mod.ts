import type { CLIErrors, GitContext } from "../../cli/context.js";
import { ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";

export type RmOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Remove files from the index and the working tree.
 *
 * Wraps `git rm -- <paths>`.
 *
 * Paths are sanitized (for Windows drive-letter case) and handed to git in one invocation.
 * When `paths` is empty there is nothing to remove, and git is not run.
 */
export async function rm(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: RmOptions = {},
): Promise<Result<void, CLIErrors>> {
    if (paths.length === 0) {
        return ok(undefined);
    }

    // TODO Unchunked, so a long enough list overruns the command-line limit; use `splitInChunks`.
    const args = ["rm", "--", ...paths.map(sanitizePath)];

    // Rewriting the index scales with its size rather than with the paths given.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, args);
}
