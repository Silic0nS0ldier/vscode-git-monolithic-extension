import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

export type MvOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Move or rename a file, staging the move.
 *
 * Wraps `git mv <from> <to>`.
 *
 * Both paths are relative to `cwd` and handed to git as given.
 */
export async function mv(
    git: GitContext,
    cwd: string,
    from: string,
    to: string,
    options: MvOptions = {},
): Promise<Result<void, CLIErrors>> {
    // TODO There is no `--`, so a `from` starting with a dash is read as an option; insert one before the paths.
    const args = ["mv", from, to];

    // Rewriting the index scales with its size rather than with the paths given.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, args);
}
