import { from_str_radix } from "monolithic-git-wasm";
import { createError, ERROR_GENERIC, type GenericError } from "../errors.js";
import { err, ok, type Result } from "../func-result.js";
import { detach } from "../helpers/detach.js";

/** Fields: hash, author name, author email, author date (unix), commit date (unix), parents, body. */
export const COMMIT_FORMAT = "%H%n%aN%n%aE%n%at%n%ct%n%P%n%B";

export type Commit = {
    hash: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    commitDate: Date;
    parents: string[];
    message: string;
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
    const commitRegex = /([0-9a-f]{40})\n(.*)\n(.*)\n(.*)\n(.*)\n(.*)(?:\n([^]*?))?(?:\x00)/gm;
    let match: RegExpExecArray | null;

    while ((match = commitRegex.exec(data)) !== null) {
        const [, hash, authorName, authorEmail, authorDateStr, commitDateStr, parents, rawMessage = ""] = match;
        const message = rawMessage.endsWith("\n") ? rawMessage.slice(0, -1) : rawMessage;

        try {
            const authorDateNum = from_str_radix(authorDateStr, 10);
            const commitDateNum = from_str_radix(commitDateStr, 10);
            commits.push({
                authorDate: new Date(authorDateNum * 1000),
                authorEmail: detach(authorEmail),
                authorName: detach(authorName),
                commitDate: new Date(commitDateNum * 1000),
                hash: detach(hash),
                message: detach(message),
                parents: parents ? detach(parents).split(" ") : [],
            });
        } catch (e) {
            return err(createError(ERROR_GENERIC, `Could not parse commit dates for "${hash}": ${e}`));
        }
    }

    return ok(commits);
}
