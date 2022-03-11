import type { GitContext } from "../../cli/context.js";
import { ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, Result, unwrap } from "../../func-result.js";

export async function gitDir(
    git: GitContext,
    cwd: string,
): Promise<Result<string, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["rev-parse", "--path-format=absolute", "--git-dir"]);

    if (isErr(result)) {
        return result;
    }

    // Keep trailing spaces which are part of the directory name
    const dotGitDir = unwrap(result).trimLeft().replace(/[\r\n]+$/, "");

    return ok(dotGitDir);
}
