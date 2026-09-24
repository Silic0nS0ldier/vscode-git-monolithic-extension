import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type AddOptions = {
    /**
     * Stage only paths git already tracks, modifications and deletions alike. Maps to `-u`;
     * otherwise `-A` also stages untracked files.
     */
    readonly update?: boolean;
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Stage changes in the working tree.
 *
 * Wraps `git add -A|-u -- <paths>`.
 *
 * When `paths` is empty, the whole working tree is staged (`.`). Otherwise paths are
 * sanitized (for Windows drive-letter case) and split into chunks that stay under the
 * platform command-line length limit; chunks are staged sequentially, and the first
 * failing chunk short-circuits the rest.
 */
export async function add(
    git: GitContext,
    cwd: string,
    paths: readonly string[],
    options: AddOptions = {},
): Promise<Result<void, CLIErrors>> {
    const baseArgs = ["add", options.update ? "-u" : "-A", "--"];

    // Staging hashes every changed file, which scales with the work tree rather than any bound.
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
