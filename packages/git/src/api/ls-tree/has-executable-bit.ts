import type { GitContext } from "../../cli/context.js";
import type { ReadToErrors } from "../../cli/helpers/read-to-string.js";
import type { Result } from "../../func-result.js";
import { checkExecutableBitFromCommand } from "../../helpers/executable-bit.js";

export async function hasExecutableBit(
    git: GitContext,
    cwd: string,
    filePath: string,
    commit_ish: string,
): Promise<Result<boolean|undefined, ReadToErrors>> {
    return checkExecutableBitFromCommand(git, cwd, ["ls-tree", commit_ish, filePath]);
}
