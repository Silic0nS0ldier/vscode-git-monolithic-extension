import { detach } from "../util/detach.js";
import { commitRegex } from "./commit-regex.js";
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

        if (message.at(-1) === "\n") {
            message = message.slice(0, -1);
        }

        commits.push({
            authorDate: new Date(Number(authorDate) * 1000),
            authorEmail: detach(authorEmail),
            authorName: detach(authorName),
            commitDate: new Date(Number(commitDate) * 1000),
            hash: detach(ref),
            message: detach(message),
            parents: parents ? parents.split(" ") : [],
        });
    } while (true);

    return commits;
}
