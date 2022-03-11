import type { GitContext } from "../../../cli/context.js";
import type { ReadToErrors } from "../../../cli/helpers/read-to-string.js";
import type { Result } from "../../../func-result.js";
import { ConfigValue, read as baseRead } from "../common/read.js";

export function read(
    git: GitContext,
    cwd: string,
    key: string,
): Promise<Result<ConfigValue, ReadToErrors>> {
    return baseRead(git, cwd, "system", key);
}
