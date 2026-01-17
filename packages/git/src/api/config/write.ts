import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";

export type Scope = "local" | "worktree" | "global" | "system";

export async function write(
    git: GitContext,
    cwd: string,
    scope: Scope,
    key: string,
    value: string,
): Promise<Result<undefined, CLIErrors>> {
    const result = await git.cli({ cwd }, [`--${scope}`, key, value]);

    if (isErr(result)) {
        return result;
    }

    return ok(undefined);
}
