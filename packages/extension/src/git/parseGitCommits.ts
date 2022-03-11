import { commitRegex } from "../git.js";
import type { Commit } from "./Commit.js";

/**
 * @todo This appears to be vulnerable to an infinite loop, or has confusing flow.
 */

export function parseGitCommits(data: string): Commit[] {
    let commits: Commit[] = [];

    let ref;
    let authorName;
    let authorEmail;
    let authorDate;
    let commitDate;
    let parents;
    let message;
    let match;

    do {
        match = commitRegex.exec(data);
        if (match === null) {
            break;
        }

        [, ref, authorName, authorEmail, authorDate, commitDate, parents, message] = match;

        if (message[message.length - 1] === "\n") {
            message = message.substr(0, message.length - 1);
        }

        // Stop excessive memory usage by using substr -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
        commits.push({
            authorDate: new Date(Number(authorDate) * 1000),
            authorEmail: ` ${authorEmail}`.substr(1),
            authorName: ` ${authorName}`.substr(1),
            commitDate: new Date(Number(commitDate) * 1000),
            hash: ` ${ref}`.substr(1),
            message: ` ${message}`.substr(1),
            parents: parents ? parents.split(" ") : [],
        });
    } while (true);

    return commits;
}
