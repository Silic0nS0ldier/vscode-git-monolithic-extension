import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";

export type Scope = "local" | "worktree" | "global" | "system";

export type WriteOptions = {
    readonly env?: { readonly [key: string]: string | undefined };
};

/**
 * Sets `key` to `value` in the config file of `scope`, replacing any single existing value.
 *
 * Wraps `git config --<scope> <key> <value>`.
 */
export async function write(
    git: GitContext,
    cwd: string,
    scope: Scope,
    key: string,
    value: string,
    options: WriteOptions = {},
): Promise<Result<undefined, CLIErrors>> {
    const result = await git.cli({ cwd, env: options.env }, ["config", `--${scope}`, key, value]);

    if (isErr(result)) {
        return result;
    }

    return ok(undefined);
}
