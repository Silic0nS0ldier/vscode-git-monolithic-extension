import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

export type NewBranchOptions = {
    /** Commit the branch starts at. Defaults to `HEAD`; an empty string is omitted. */
    readonly startPoint?: string;
    /** Never set up tracking, whatever `branch.autoSetupMerge` says. Maps to `--no-track`. */
    readonly noTrack?: boolean;
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Create a branch and switch to it, carrying local changes over.
 *
 * Wraps `git checkout -q -b <name> [--no-track] [start-point]`.
 */
export async function newBranch(
    git: GitContext,
    cwd: string,
    name: string,
    options: NewBranchOptions = {},
): Promise<Result<void, CLIErrors>> {
    const args = ["checkout", "-q", "-b", name];

    if (options.noTrack) {
        args.push("--no-track");
    }

    if (options.startPoint) {
        args.push(options.startPoint);
    }

    // Rewriting the work tree scales with the files that change rather than any bound.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, args);
}
