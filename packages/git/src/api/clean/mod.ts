import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

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
 * Wraps `git clean -f [-q] [-d] [-- <paths>]`.
 */
export function clean(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: CleanOptions = {},
): Promise<Result<void, CLIErrors>> {
    const args = ["clean", "-f"];

    if (options.quiet) {
        args.push("-q");
    }

    if (options.directories) {
        args.push("-d");
    }

    if (paths.length > 0) {
        args.push("--", ...paths);
    }

    return git.cli({ cwd }, args);
}
