import { GitContext } from "../../cli/context.js";
import { ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { Result } from "../../func-result.js";

export async function findTrackingBranches(
    git: GitContext,
    cwd: string,
): Promise<Result<string, ReadToErrors>> {
    return readToString({ cli: git.cli, cwd }, [
        "for-each-ref",
        "--format",
        "%(refname:short)%00%(upstream:short)",
        "refs/heads",
    ]);
}
