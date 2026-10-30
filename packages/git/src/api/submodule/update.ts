import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type UpdateOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Check out the commit the superproject records for each given submodule.
 *
 * Wraps `git submodule update -- <paths>`.
 *
 * Paths are sanitized (for Windows drive-letter case) and split into chunks that stay under the
 * platform command-line length limit; chunks are updated sequentially, and the first failing chunk
 * short-circuits the rest. When `paths` is empty there is nothing to update, and git is not run.
 *
 * `submodule` is not a git builtin, so a git build that cannot locate its own `libexec` needs
 * `GIT_EXEC_PATH` in `env`.
 */
export async function update(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: UpdateOptions = {},
): Promise<Result<void, CLIErrors>> {
    for (const chunk of splitInChunks(paths.map(sanitizePath))) {
        // Updating may fetch a missing commit from the submodule's remote, which has no bound.
        const result = await git.cli(
            { cwd, env: options.env, timeout: Number.POSITIVE_INFINITY },
            ["submodule", "update", "--", ...chunk],
        );
        if (isErr(result)) {
            return result;
        }
    }

    return ok(undefined);
}
