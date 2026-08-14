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
        t.is(unwrap(res)[0].message, "Subject\n\nBody line");
        t.deepEqual(unwrap(res)[0].parents, [PARENT]);
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
