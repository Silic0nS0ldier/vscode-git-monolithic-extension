import type { GitContext } from "../../../cli/context.js";
import { type ReadToErrors, readToString } from "../../../cli/helpers/read-to-string.js";
import type { Result } from "../../../func-result.js";

export async function get(
    git: GitContext,
    cwd: string,
): Promise<Result<string, ReadToErrors>> {
    return readToString({ cli: git.cli, cwd }, [
        "remote",
        "--verbose",
    ]);
}
