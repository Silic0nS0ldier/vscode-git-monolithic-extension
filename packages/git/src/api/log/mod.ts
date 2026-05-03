import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { from_str_radix } from "monolithic-git-wasm";

/** Format string for `git log`. Fields: hash, author name, author email, author date (unix), commit date (unix), parents, body. */
const COMMIT_FORMAT = "%H%n%aN%n%aE%n%at%n%ct%n%P%n%B";

/** 10 MiB — generous ceiling for bounded log output. */
const LOG_MAX_BUFFER = 10 * 1024 * 1024;

export type LogEntry = {
    hash: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    commitDate: Date;
    parents: string[];
    message: string;
};

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
): Promise<Result<LogEntry[], ReadToErrors>> {
    const maxEntries = opts?.maxEntries ?? 32;
    const args = ["log", `-n${maxEntries}`, `--format=${COMMIT_FORMAT}`, "-z", "--"];
    if (opts?.path) {
        args.push(opts.path);
    }

    const result = await readToBuffer({ cli: git.cli, cwd }, args, LOG_MAX_BUFFER);

    if (isErr(result)) {
        return result;
    }

    const data = unwrap(result).toString("utf-8");
    const entries: LogEntry[] = [];

    // Re-created on each call to avoid stale lastIndex across invocations.
    const commitRegex = /([0-9a-f]{40})\n(.*)\n(.*)\n(.*)\n(.*)\n(.*)(?:\n([^]*?))?(?:\x00)/gm;
    let match: RegExpExecArray | null;
    while ((match = commitRegex.exec(data)) !== null) {
        const [, hash, authorName, authorEmail, authorDateStr, commitDateStr, parents, rawMessage = ""] = match;
        const message = rawMessage.endsWith("\n") ? rawMessage.slice(0, -1) : rawMessage;
        try {
            const authorDateNum = from_str_radix(authorDateStr, 10);
            const commitDateNum = from_str_radix(commitDateStr, 10);
            entries.push({
                authorDate: new Date(authorDateNum * 1000),
                authorEmail,
                authorName,
                commitDate: new Date(commitDateNum * 1000),
                hash,
                message,
                parents: parents ? parents.split(" ") : [],
            });
        } catch (e) {
            return err(createError(ERROR_GENERIC, `Could not parse commit dates for "${hash}": ${e}`));
        }
    }

    return ok(entries);
}
