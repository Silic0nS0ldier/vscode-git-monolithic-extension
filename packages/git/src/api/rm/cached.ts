import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type RmCachedOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Remove paths, recursively, from the index only, leaving them in the work tree as untracked.
 *
 * Wraps `git rm --cached -r -- <paths>`.
 *
 * When `paths` is empty, everything in the index is removed (`.`), which fails if the index is
 * already empty. Otherwise paths are sanitized (for Windows drive-letter case) and split into
 * chunks that stay under the platform command-line length limit; chunks are removed
 * sequentially, and the first failing chunk short-circuits the rest.
 */
export async function rmCached(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: RmCachedOptions = {},
): Promise<Result<void, CLIErrors>> {
    // TODO Without `HEAD`, git refuses a file whose work tree differs from the index ("staged
    // content different from both the file and the HEAD"), so undoing a root commit after
    // modifying one of its files fails once the branch is already deleted. Pass `-f`; nothing is
    // lost, as `--cached` never touches the work tree.
    const baseArgs = ["rm", "--cached", "-r", "--"];

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
