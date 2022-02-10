import { GitContext } from "../../cli/context.js";
import { ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, Result, unwrap } from "../../func-result.js";

export async function version(git: GitContext): Promise<Result<string, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd: "/" }, ["--version"]);

    if (isErr(result)) {
        return result;
    }

    const versionStr = unwrap(result).replace(/^git version /, "").trim();

    return ok(versionStr);
}
