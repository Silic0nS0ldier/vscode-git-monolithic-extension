import semver from "semver";
import type { GitContext } from "../../cli/context.js";
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

/** Attempts to compare the git version to a semver range. Useful for handling version specific behaviours. */
export function trySemverCheck(gitVersion: string, range: string) {
    const semverGitVersion = semver.coerce(gitVersion);
    if (semverGitVersion === null) {
        // TODO Specific output type
        return false;
    }
    return semver.satisfies(semverGitVersion, range);
}
