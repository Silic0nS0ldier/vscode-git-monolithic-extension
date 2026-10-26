import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type ResetPathsOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Set the index entries for the given paths to their state in `treeish`, leaving `HEAD` and the
 * work tree alone. Against `HEAD`, this unstages them.
 *
 * Wraps `git reset -q <treeish> -- <paths>`.
 *
 * When `paths` is empty, the whole index is reset (`.`). Otherwise paths are sanitized (for
 * Windows drive-letter case) and split into chunks that stay under the platform command-line
 * length limit; chunks are reset sequentially, and the first failing chunk short-circuits the rest.
 */
export async function resetPaths(
    git: GitContext,
    cwd: string,
    treeish: string,
    paths: readonly string[],
    options: ResetPathsOptions = {},
): Promise<Result<void, CLIErrors>> {
    const baseArgs = ["reset", "-q", treeish, "--"];

    // Rewriting the index scales with its size rather than with the paths given.
    const invoke = (pathspecs: readonly string[]) =>
        git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, [...baseArgs, ...pathspecs]);

    if (paths.length === 0) {
        return invoke(["."]);
    }

    for (const chunk of splitInChunks(paths.map(sanitizePath))) {
        const result = await invoke(chunk);
        if (isErr(result)) {
            return result;
        }
    }

    return ok(undefined);
}
