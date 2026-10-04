import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { log } from "./mod.js";

const HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

test("Single commit, no parents", async t => {
    // Format: hash\nauthorName\nauthorEmail\nauthorDate\ncommitDate\nparents\nmessage\0
    const raw = `${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\nInitial commit\n\0`;

    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await log(gitContext, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        const [commit, ...extras] = unwrap(res);
        t.is(extras.length, 0);
        if (t.assert(commit)) {
            t.like(commit, {
                hash: HASH,
                authorName: "Alice",
                authorEmail: "alice@example.com",
                authorDate: new Date(1000000000 * 1000),
                commitDate: new Date(1000000001 * 1000),
                parents: [],
                message: "Initial commit",
            });
        }
    }
});

test("Commit with parent", async t => {
    const PARENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const raw = `${HASH}\nBob\nbob@example.com\n1000000002\n1000000003\n${PARENT}\nSecond commit\n\0`;

    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await log(gitContext, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        const [commit, ...extras] = unwrap(res);
        t.is(extras.length, 0);
        if (t.assert(commit)) {
            t.like(commit, {
                parents: [PARENT],
                message: "Second commit",
            });
        }
    }
});

test("Two commits", async t => {
    const HASH2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const raw = `${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\nFirst\n\0`
        + `${HASH2}\nBob\nbob@example.com\n1000000002\n1000000003\n${HASH}\nSecond\n\0`;

    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await log(gitContext, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        const commits = unwrap(res);
        t.deepEqual(commits.map(commit => commit.message), ["First", "Second"]);
    }
});

test("Empty output returns empty array", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await log(gitContext, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});
