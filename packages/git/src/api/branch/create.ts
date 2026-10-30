import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

export type CreateOptions = {
    /** Commit the branch starts at. Defaults to `HEAD`; an empty string is omitted. */
    readonly startPoint?: string;
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Create a branch without switching to it. `branch.autoSetupMerge` decides tracking.
 *
 * Wraps `git branch -q <name> [start-point]`.
 */
export async function create(
    git: GitContext,
    cwd: string,
    name: string,
    options: CreateOptions = {},
): Promise<Result<void, CLIErrors>> {
    // TODO A `name` starting with a dash is read as an option; insert `--end-of-options` ahead of it.
    const args = ["branch", "-q", name];

    if (options.startPoint) {
        args.push(options.startPoint);
    }

    // Matches the untimed invocation this replaces; a ref write is cheap but runs no faster for a deadline.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, args);
}
