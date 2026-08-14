import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { isErr, type Result, unwrap } from "../../func-result.js";
import { type Commit, COMMIT_FORMAT, parseCommits } from "../commit.js";

/** 10 MiB — generous ceiling for bounded log output. */
const LOG_MAX_BUFFER = 10 * 1024 * 1024;

export type LogOptions = {
    /** Maximum number of commits to return. Defaults to 32. */
    maxEntries?: number;
    /** Limit output to commits that touch this path. */
    path?: string;
};

/**
 * Returns a list of commits from the repository log.
 * Wraps `git log -n<N> --format=<fmt> -z --`.
 */
export async function log(
    git: GitContext,
    cwd: string,
    opts?: LogOptions,
): Promise<Result<Commit[], ReadToErrors>> {
    const maxEntries = opts?.maxEntries ?? 32;
    const args = ["log", `-n${maxEntries}`, `--format=${COMMIT_FORMAT}`, "-z", "--"];
    if (opts?.path) {
        args.push(opts.path);
    }

    const result = await readToBuffer({ cli: git.cli, cwd }, args, LOG_MAX_BUFFER);

    if (isErr(result)) {
        return result;
    }

    return parseCommits(unwrap(result).toString("utf-8"));
}
