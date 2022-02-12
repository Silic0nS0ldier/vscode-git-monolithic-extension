import { CLIErrors, GitContext } from "../../../cli/context.js";
import { Result } from "../../../func-result.js";

export function init(
    git: GitContext,
    cwd: string,
): Promise<Result<void, CLIErrors>> {
    return git.cli({ cwd }, ["init"]);
}
