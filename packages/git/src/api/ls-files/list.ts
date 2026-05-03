import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export type LsFilesEntry = {
    mode: string;
    object: string;
    stage: string;
    file: string;
};

/**
 * Returns staged index info for a given path.
 * Wraps `git ls-files --stage -- <filePath>`.
 */
export async function lsFiles(
    git: GitContext,
    cwd: string,
    filePath: string,
): Promise<Result<LsFilesEntry[], ReadToErrors>> {
    const result = await readToString(
        { cli: git.cli, cwd },
        ["ls-files", "--stage", "--", filePath],
    );

    if (isErr(result)) {
        return result;
    }

    const raw = unwrap(result);
    const entries = raw
        .split("\n")
        .filter(l => l.length > 0)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        .map(([, mode, object, stage, file]) => ({ file, mode, object, stage }));

    return ok(entries);
}
