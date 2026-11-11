import { from_str_radix } from "monolithic-git-wasm";
import { inspect } from "node:util";
import { createError, ERROR_GENERIC, type GenericError } from "../errors.js";
import { err, ok, type Result } from "../func-result.js";
import { detach } from "../helpers/detach.js";

/** Fields: hash, author name, author email, author date (unix), commit date (unix), parents, body. */
export const COMMIT_FORMAT = "%H%n%aN%n%aE%n%at%n%ct%n%P%n%B";

export type CommitShortStat = { files: number; insertions: number; deletions: number };

export type Commit = {
    hash: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    commitDate: Date;
    parents: string[];
    message: string;
    shortStat?: CommitShortStat;
    filePath?: string;
};

/**
 * Parses the NUL terminated records that `COMMIT_FORMAT` produces under `-z`.
 *
 * Every field kept is detached: they are capture groups over output that runs to megabytes,
 * and a single retained commit would otherwise pin all of it.
 */
export function parseCommits(data: string): Result<Commit[], GenericError> {
    const commits: Commit[] = [];

    // Re-created on each call to avoid stale lastIndex across invocations.
    // eslint-disable-next-line no-control-regex -- `\x00` matches the NUL that `-z` terminates each record with.
    const commitRegex = /\b([0-9a-f]{64}|[0-9a-f]{40})\n(.*)\n(.*)\n(.*)\n(.*)\n(.*)(?:\n([^]*?))?(?:\x00)/gm;
    // eslint-disable-next-line no-control-regex
    const numstatRegex = /^\n?(?:-|\d+)\t(?:-|\d+)\t(?:\x00[^\x00]*\x00([^\x00]+)|([^\x00]+))\x00/;
    const matches: RegExpExecArray[] = [];
    for (let match = commitRegex.exec(data); match !== null; match = commitRegex.exec(data)) {
        matches.push(match);
        // Filenames may contain complete commit-shaped text. Consume their NUL fields before finding another header.
        let position = commitRegex.lastIndex;
        for (
            let entry = numstatRegex.exec(data.slice(position));
            entry !== null;
            entry = numstatRegex.exec(data.slice(position))
        ) {
            position += entry[0].length;
        }
        commitRegex.lastIndex = position;
    }

    for (const [index, match] of matches.entries()) {
        const [, hash, authorName, authorEmail, authorDateStr, commitDateStr, parents, rawMessage = ""] = match;

        // Invariant: All expected fields are populated, issues here point to flaw in regex.
        if (!hash || !authorName || !authorEmail || !authorDateStr || !commitDateStr || parents == null) {
            // "...","b57c59aa6aa7716372e94c3ef9d89049540a7c19","Test User","test@example.com","1791091634","1791091634","","Initial commit\\n"
            return err(createError(ERROR_GENERIC, `Missing required commit fields in data: ${JSON.stringify(match)}`));
        }

        const message = rawMessage.endsWith("\n") ? rawMessage.slice(0, -1) : rawMessage;

        try {
            const authorDateNum = from_str_radix(authorDateStr, 10);
            const commitDateNum = from_str_radix(commitDateStr, 10);
            const commit: Commit = {
                authorDate: new Date(authorDateNum * 1000),
                authorEmail: detach(authorEmail),
                authorName: detach(authorName),
                commitDate: new Date(commitDateNum * 1000),
                hash: detach(hash),
                message: detach(message),
                parents: parents ? detach(parents).split(" ") : [],
            };
            const suffix = data.slice(match.index + match[0].length, matches[index + 1]?.index ?? data.length);
            // `-z --numstat` uses extra NUL fields for renames, and never quotes unusual filenames.
            const numstat = suffix.match(numstatRegex);
            const filePath = numstat?.[1] ?? numstat?.[2];
            if (filePath) {
                commit.filePath = detach(filePath);
            }
            const stats = suffix.slice(suffix.lastIndexOf("\0") + 1).match(
                /^\s+(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?\s*$/m,
            );
            if (stats?.[1]) {
                commit.shortStat = {
                    files: from_str_radix(stats[1], 10),
                    insertions: stats[2] ? from_str_radix(stats[2], 10) : 0,
                    deletions: stats[3] ? from_str_radix(stats[3], 10) : 0,
                };
            }
            commits.push(commit);
        } catch (e) {
            return err(createError(ERROR_GENERIC, `Could not parse commit dates for "${hash}": ${inspect(e)}`));
        }
    }

    return ok(commits);
}
