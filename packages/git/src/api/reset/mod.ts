import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

export type ResetMode = "soft" | "hard";

export type ResetOptions = {
    /**
     * `soft` moves only `HEAD`, keeping the index and the work tree. `hard` also discards every
     * change to tracked files in both.
     */
    readonly mode: ResetMode;
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Point the current branch (or a detached `HEAD`) at another commit.
 *
 * Wraps `git reset --soft|--hard <treeish>`.
 */
export async function reset(
    git: GitContext,
    cwd: string,
    treeish: string,
    options: ResetOptions,
): Promise<Result<void, CLIErrors>> {
    // TODO Without a trailing `--`, a file named like `treeish` makes git refuse it as ambiguous,
    // and a `treeish` starting with `-` is read as an option. Append `--`.
    const args = ["reset", options.mode === "hard" ? "--hard" : "--soft", treeish];

    // A hard reset rewrites the work tree, which scales with its size rather than any bound.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, args);
}
