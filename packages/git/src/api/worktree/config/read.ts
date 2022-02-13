import { GitContext } from "../../../cli/context.js";
import { ReadToErrors } from "../../../cli/helpers/read-to-string.js";
import { Result } from "../../../func-result.js";
import { ConfigValue, read as baseRead } from "../../config/common/read.js";

export function read(
    git: GitContext,
    cwd: string,
    key: string,
): Promise<Result<ConfigValue, ReadToErrors>> {
    return baseRead(git, cwd, "worktree", key);
}
