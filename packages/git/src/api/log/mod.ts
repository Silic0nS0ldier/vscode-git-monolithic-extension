import { Readable } from "node:stream";
import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { createError, ERROR_GENERIC, ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { type Commit, COMMIT_FORMAT, parseCommits } from "../commit.js";
import { createRecordDiscarder } from "./discard.js";

/** 10 MiB — generous ceiling for bounded log output. */
const LOG_MAX_BUFFER = 10 * 1024 * 1024;
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export type LogOptions = {
    /** Maximum number of commits to return. Defaults to 32. */
    maxEntries?: number;
    /** Limit output to commits that touch this path. */
    path?: string;
    skip?: number;
    /**
     * Number of commits to read and drop before those returned, without buffering them. Unlike `skip`, which git
     * applies before `follow` filters commits and so loses renames it skips past, git still walks and filters these.
     */
    discard?: number;
    hash?: string;
    /** Visit each commit before its parents, even when timestamps disagree. */
    topoOrder?: boolean;
    follow?: boolean;
    filePaths?: boolean;
    shortStats?: boolean;
    signal?: AbortSignal;
};

export type SourcedCommit = Commit & { source: string };

export type SourcedLogOptions = {
    /** Full commit hashes to traverse together. */
    hashes: readonly string[];
    maxEntries?: number;
    skip?: number;
    signal?: AbortSignal;
};

/**
 * Returns a list of commits from the repository log.
 * Wraps `git -c i18n.logOutputEncoding=UTF-8 log -n<N+discard> --format=<fmt> -z [--topo-order] [--skip=N] [ref] [--shortstat] [--numstat] [--follow] -- [path]`.
 */
export async function log(
    git: GitContext,
    cwd: string,
    opts?: LogOptions,
): Promise<Result<Commit[], ReadToErrors>> {
    return readLog(git, cwd, opts);
}

/**
 * Traverses multiple captured tips in topological order, identifying a tip from which each commit was reached.
 */
export async function logWithSources(
    git: GitContext,
    cwd: string,
    opts: SourcedLogOptions,
): Promise<Result<SourcedCommit[], ReadToErrors>> {
    if (!opts.hashes.length || opts.hashes.some(hash => !HASH.test(hash))) {
        return err(createError(ERROR_GENERIC, "Invalid log traversal tips"));
    }
    const result = await readLog(git, cwd, { ...opts, topoOrder: true }, opts.hashes);
    if (isErr(result)) return result;
    const sources = new Set(opts.hashes);
    const commits: SourcedCommit[] = [];
    for (const commit of unwrap(result)) {
        const newline = commit.message.indexOf("\n");
        const source = newline === -1 ? commit.message : commit.message.slice(0, newline);
        if (!sources.has(source)) return err(createError(ERROR_GENERIC, "Invalid log traversal source"));
        commits.push({ ...commit, source, message: newline === -1 ? "" : commit.message.slice(newline + 1) });
    }
    return ok(commits);
}

async function readLog(
    git: GitContext,
    cwd: string,
    opts?: LogOptions,
    sources?: readonly string[],
): Promise<Result<Commit[], ReadToErrors>> {
    const maxEntries = opts?.maxEntries ?? 32;
    if (
        !Number.isSafeInteger(maxEntries) || maxEntries < 1
        || (opts?.skip !== undefined && (!Number.isSafeInteger(opts.skip) || opts.skip < 0))
        || (opts?.discard !== undefined && (!Number.isSafeInteger(opts.discard) || opts.discard < 0))
        || !Number.isSafeInteger(maxEntries + (opts?.discard ?? 0))
        || opts?.hash?.startsWith("-") || (opts?.follow && !opts.path)
    ) {
        return err(createError(ERROR_GENERIC, "Invalid log paging or revision options"));
    }
    const args = [
        "-c",
        "i18n.logOutputEncoding=UTF-8",
        "log",
        `-n${maxEntries + (opts?.discard ?? 0)}`,
        `--format=${sources ? COMMIT_FORMAT.replace("%n%B", "%n%S%n%B") : COMMIT_FORMAT}`,
        "-z",
    ];
    if (opts?.topoOrder) args.push("--topo-order");
    if (opts?.skip !== undefined) args.push(`--skip=${opts.skip}`);
    if (opts?.hash) args.push(opts.hash);
    if (sources) args.push("--stdin");
    if (opts?.shortStats) args.push("--shortstat");
    if (opts?.filePaths) args.push("--numstat");
    if (opts?.follow) args.push("--follow");
    args.push("--");
    if (opts?.path) {
        args.push(opts.path);
    }

    const result = await readToBuffer(
        {
            cli: git.cli,
            cwd,
            signal: opts?.signal,
            stdin: sources ? Readable.from(sources.map(hash => `${hash}\n`)) : undefined,
            filter: opts?.discard ? createRecordDiscarder(opts.discard) : undefined,
        },
        args,
        LOG_MAX_BUFFER,
    );

    if (isErr(result)) {
        const failure = unwrap(result);
        if (failure.type === ERROR_NON_ZERO_EXIT && /does not have any commits yet/.test(failure.cause.stderr)) {
            return ok([]);
        }
        return result;
    }

    return parseCommits(unwrap(result).toString("utf-8"));
}
