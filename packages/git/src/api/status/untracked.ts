import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export async function untracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative"|"absolute",
): Promise<Result<string[], ReadToErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    // TODO Use streaming
    const result = await readToString({ cli: git.cli, cwd }, ["ls-files", "-z", "--others", "--exclude-standard"]);

    if (isErr(result)) {
        return result;
    }

    const paths = unwrap(result)
        .split("\0")
        .filter(f => f !== "");

    return ok(paths);
}

