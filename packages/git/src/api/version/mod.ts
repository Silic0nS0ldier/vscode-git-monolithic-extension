import { compareVersions } from "compare-versions";
import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export async function version(git: GitContext): Promise<Result<string, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd: "/" }, ["--version"]);

    if (isErr(result)) {
        return result;
    }

    const versionStr = unwrap(result).replace(/^git version /, "").trim();

    return ok(versionStr);
}

/** Attempts to compare the git version to a semver range. Useful for handling version specific behaviours. */
export function trySemverCheck(gitVersion: string, range: string): boolean {
    // Vendor builds append non-semver suffixes (e.g. `2.45.1.windows.1`, `2.39.3 (Apple Git-146)`).
    const numericPrefix = /^\d+(?:\.\d+){0,3}/.exec(gitVersion)?.[0] ?? gitVersion;
    return compareVersions(numericPrefix, range) >= 0;
}
