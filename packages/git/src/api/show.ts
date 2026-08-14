import type { GitContext } from "../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../cli/helpers/read-to-buffer.js";
import { readToString } from "../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../func-result.js";
import { type Commit, COMMIT_FORMAT, parseCommits } from "./commit.js";

export async function show(git: GitContext, cwd: string, object: string): Promise<Result<Buffer, ReadToErrors>> {
    const args = ["show", "--textconv", object];
    const result = await readToBuffer({ cli: git.cli, cwd }, args, Infinity);

    if (isErr(result)) {
        // TODO(Silic0nS0ldier): Classify as a wrong case error if stderr contains
        // "exists on disk, but not in"
        return result;
    }

    return result;
}

/**
 * Reads the commit a revision resolves to, without its diff. Resolves to `undefined` when
 * the output does not parse. Wraps `git show -s --format=<fmt> -z <ref>`.
 */
export async function commit(
    git: GitContext,
    cwd: string,
    ref: string,
): Promise<Result<Commit | undefined, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["show", "-s", `--format=${COMMIT_FORMAT}`, "-z", ref]);

    if (isErr(result)) {
        return result;
    }

    const commits = parseCommits(unwrap(result));

    if (isErr(commits)) {
        return commits;
    }

    return ok(unwrap(commits)[0]);
}
