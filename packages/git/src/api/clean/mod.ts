import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type CleanOptions = {
    /**
     * Recurse into untracked directories. Maps to `-d`.
     */
    directories?: boolean;
    /**
     * Suppress output. Maps to `-q`.
     */
    quiet?: boolean;
};

/**
 * Remove untracked files from the working tree.
 *
 * Wraps `git clean -f [-q] [-d] [-- <paths>]`.
 *
 * When `paths` is empty, `git clean` operates on the entire working tree.
 * Otherwise, only files matching one of the given paths are considered.
 * Tracked files in the pathspec are silently skipped by `git clean`.
 *
 * Paths are sanitized (for Windows drive-letter case) and split into chunks
 * that stay under the platform command-line length limit; chunks are invoked
 * sequentially, and the first failing chunk short-circuits the rest.
 */
export async function clean(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: CleanOptions = {},
): Promise<Result<void, CLIErrors>> {
    const baseArgs = ["clean", "-f"];

    if (options.quiet) {
        baseArgs.push("-q");
    }

    if (options.directories) {
        baseArgs.push("-d");
    }

    if (paths.length === 0) {
        return git.cli({ cwd }, baseArgs);
    }

    const sanitized = paths.map(sanitizePath);
    for (const chunk of splitInChunks(sanitized)) {
        const result = await git.cli({ cwd }, [...baseArgs, "--", ...chunk]);
        if (isErr(result)) {
            return result;
        }
    }

    return ok(undefined);
}
