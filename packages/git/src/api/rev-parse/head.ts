import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export async function head(
    git: GitContext,
    cwd: string,
): Promise<Result<string | undefined, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["rev-parse", "HEAD"]);

    if (isErr(result)) {
        return result;
    }

    const commitMaybe = unwrap(result).trim();

    if (commitMaybe === "") {
        return ok(undefined);
    }

    return ok(commitMaybe);
}
