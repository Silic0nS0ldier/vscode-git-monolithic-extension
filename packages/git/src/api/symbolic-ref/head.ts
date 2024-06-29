import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export async function head(
    git: GitContext,
    cwd: string,
): Promise<Result<string | undefined, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["symbolic-ref", "--short", "HEAD"]);

    if (isErr(result)) {
        return result;
    }

    const headRef = unwrap(result).trim();

    if (headRef === "") {
        return ok(undefined);
    }

    return ok(headRef);
}
