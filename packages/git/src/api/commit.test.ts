import test from "ava";
import { isErr, isOk, unwrap } from "../func-result.js";
import { parseCommits } from "./commit.js";

const HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const PARENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function record(hash: string, parents: string, message: string): string {
    return `${hash}\nAlice\nalice@example.com\n1000000000\n1000000001\n${parents}\n${message}\0`;
}

test("Parses a record", t => {
    const res = parseCommits(record(HASH, "", "Initial commit\n"));
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [{
            authorDate: new Date(1000000000 * 1000),
            authorEmail: "alice@example.com",
            authorName: "Alice",
            commitDate: new Date(1000000001 * 1000),
            hash: HASH,
            message: "Initial commit",
            parents: [],
        }]);
    }
});

test("Keeps the blank line between subject and body", t => {
    const res = parseCommits(record(HASH, PARENT, "Subject\n\nBody line\n"));
    t.true(isOk(res));
    if (isOk(res)) {
        const commits = unwrap(res);
        t.deepEqual(commits.map(commit => commit.message), ["Subject\n\nBody line"]);
        t.deepEqual(commits.map(commit => commit.parents), [[PARENT]]);
    }
});

test("Reads every record in the stream", t => {
    const res = parseCommits(record(HASH, PARENT, "Second\n") + record(PARENT, "", "First\n"));
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).map(commit => commit.message), ["Second", "First"]);
    }
});

test("Reports unparseable dates", t => {
    const res = parseCommits(`${HASH}\nAlice\nalice@example.com\nnot-a-date\n1000000001\n\nSubject\n\0`);
    t.true(isErr(res));
});

test("Yields nothing for empty output", t => {
    const res = parseCommits("");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});

test("Parses binary renamed paths and statistics without quoting filenames", t => {
    const data = record(HASH, PARENT, "Rename\n")
        + "\n0\t0\t\0old\tname\0new\nname\0\n 1 file changed, 0 insertions(+), 0 deletions(-)\n"
        + record(PARENT, "", "Create\n") + "\n1\t0\told\tname\0\n 1 file changed, 1 insertion(+)\n";
    const result = parseCommits(data);
    t.true(isOk(result));
    if (isOk(result)) {
        t.deepEqual(unwrap(result).map(c => [c.filePath, c.shortStat]), [
            ["new\nname", { files: 1, insertions: 0, deletions: 0 }],
            ["old\tname", { files: 1, insertions: 1, deletions: 0 }],
        ]);
    }
});

test("Preserves complete SHA-256 commit hashes", t => {
    const result = parseCommits(record("a".repeat(64), "", "Root\n"));
    t.true(isOk(result));
    if (isOk(result)) t.is(unwrap(result)[0]?.hash, "a".repeat(64));
});

test("Does not interpret a filename containing commit fields as another commit", t => {
    const filePath = record(PARENT, "", "Not a commit\n").slice(0, -1);
    const result = parseCommits(record(HASH, PARENT, "Real commit\n") + `\n1\t0\t${filePath}\0`);
    t.true(isOk(result));
    if (isOk(result)) {
        t.deepEqual(unwrap(result).map(commit => [commit.hash, commit.filePath]), [[HASH, filePath]]);
    }
});
