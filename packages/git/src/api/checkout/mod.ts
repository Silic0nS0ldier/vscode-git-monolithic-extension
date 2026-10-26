import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type CheckoutOptions = {
    /** Create a branch tracking the remote branch `treeish` names. Maps to `--track`. */
    readonly track?: boolean;
    /** Leave `HEAD` detached at `treeish`, even when it names a branch. Maps to `--detach`. */
    readonly detach?: boolean;
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Switch `HEAD` to `treeish`, or, given paths, restore them in the index and work tree.
 *
 * Wraps `git checkout -q [--track] [--detach] [treeish] [-- <paths>]`.
 *
 * An empty `treeish` is omitted, so paths are restored from the index. Paths are sanitized (for
 * Windows drive-letter case) and split into chunks that stay under the platform command-line
 * length limit; chunks are checked out sequentially, and the first failing chunk short-circuits
 * the rest.
 */
export async function checkout(
    git: GitContext,
    cwd: string,
    treeish: string,
    paths: readonly string[],
    options: CheckoutOptions = {},
): Promise<Result<void, CLIErrors>> {
    const baseArgs = ["checkout", "-q"];

    if (options.track) {
        baseArgs.push("--track");
    }

    if (options.detach) {
        baseArgs.push("--detach");
    }

    if (treeish) {
        baseArgs.push(treeish);
    }

    // Rewriting the work tree scales with the files that change rather than any bound.
    const invoke = (args: readonly string[]) =>
        git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, [...args]);

    if (paths.length === 0) {
        // TODO With no `--`, a `treeish` that names no ref but does name a file restores that file
        // instead of failing. Append `--` after the treeish.
        return invoke(baseArgs);
    }

    for (const chunk of splitInChunks(paths.map(sanitizePath))) {
        const result = await invoke([...baseArgs, "--", ...chunk]);
        if (isErr(result)) {
            return result;
        }
    }

    return ok(undefined);
}
