import type { GitContext } from "../../cli/context.js";
import type { ReadToErrors } from "../../cli/helpers/read-to-string.js";
import type { Result } from "../../func-result.js";
import { checkExecutableBitFromCommand } from "../../helpers/executable-bit.js";

export async function hasExecutableBitInIndex(
    git: GitContext,
    cwd: string,
    filePath: string,
): Promise<Result<boolean | undefined, ReadToErrors>> {
    return checkExecutableBitFromCommand(git, cwd, ["ls-files", "--stage", "--", filePath]);
}
