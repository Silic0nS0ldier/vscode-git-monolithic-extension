import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

export type DeleteRefOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Delete a ref. `HEAD` deletes the branch it points at, leaving that branch unborn. A ref that
 * does not exist is not an error.
 *
 * Wraps `git update-ref -d <ref>`.
 */
export async function deleteRef(
    git: GitContext,
    cwd: string,
    ref: string,
    options: DeleteRefOptions = {},
): Promise<Result<void, CLIErrors>> {
    // Deleting a packed ref rewrites `packed-refs`, which scales with the number of refs.
    return git.cli({ cwd, env: options.env, timeout: Number.POSITIVE_INFINITY }, ["update-ref", "-d", ref]);
}
