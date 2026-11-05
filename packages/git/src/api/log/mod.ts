import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { createError, ERROR_GENERIC, ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { type Commit, COMMIT_FORMAT, parseCommits } from "../commit.js";

/** 10 MiB — generous ceiling for bounded log output. */
const LOG_MAX_BUFFER = 10 * 1024 * 1024;

export type LogOptions = {
    /** Maximum number of commits to return. Defaults to 32. */
    maxEntries?: number;
    /** Limit output to commits that touch this path. */
    path?: string;
    skip?: number;
    hash?: string;
    follow?: boolean;
    filePaths?: boolean;
    shortStats?: boolean;
    signal?: AbortSignal;
};

/**
 * Returns a list of commits from the repository log.
 * Wraps `git -c i18n.logOutputEncoding=UTF-8 log -n<N> --format=<fmt> -z [--skip=N] [ref] [--shortstat] [--numstat] [--follow] -- [path]`.
 */
export async function log(
    git: GitContext,
    cwd: string,
    opts?: LogOptions,
): Promise<Result<Commit[], ReadToErrors>> {
    const maxEntries = opts?.maxEntries ?? 32;
    if (
        !Number.isSafeInteger(maxEntries) || maxEntries < 1
        || (opts?.skip !== undefined && (!Number.isSafeInteger(opts.skip) || opts.skip < 0))
        || opts?.hash?.startsWith("-") || (opts?.follow && !opts.path)
    ) {
        return err(createError(ERROR_GENERIC, "Invalid log paging or revision options"));
    }
    const args = ["-c", "i18n.logOutputEncoding=UTF-8", "log", `-n${maxEntries}`, `--format=${COMMIT_FORMAT}`, "-z"];
    if (opts?.skip !== undefined) args.push(`--skip=${opts.skip}`);
    if (opts?.hash) args.push(opts.hash);
    if (opts?.shortStats) args.push("--shortstat");
    if (opts?.filePaths) args.push("--numstat");
    if (opts?.follow) args.push("--follow");
    args.push("--");
    if (opts?.path) {
        args.push(opts.path);
    }

    const result = await readToBuffer({ cli: git.cli, cwd, signal: opts?.signal }, args, LOG_MAX_BUFFER);

    if (isErr(result)) {
        const failure = unwrap(result);
        if (failure.type === ERROR_NON_ZERO_EXIT && /does not have any commits yet/.test(failure.cause.stderr)) {
            return ok([]);
        }
        return result;
    }

    return parseCommits(unwrap(result).toString("utf-8"));
}
