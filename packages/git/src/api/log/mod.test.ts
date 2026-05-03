import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { log } from "./mod.js";
import type { GitContext } from "../../cli/context.js";

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
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.is(entries[0].hash, HASH);
        t.is(entries[0].authorName, "Alice");
        t.is(entries[0].authorEmail, "alice@example.com");
        t.deepEqual(entries[0].authorDate, new Date(1000000000 * 1000));
        t.deepEqual(entries[0].commitDate, new Date(1000000001 * 1000));
        t.deepEqual(entries[0].parents, []);
        t.is(entries[0].message, "Initial commit");
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
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.deepEqual(entries[0].parents, [PARENT]);
        t.is(entries[0].message, "Second commit");
    }
});

test("Two commits", async t => {
    const HASH2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const raw =
        `${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\nFirst\n\0` +
        `${HASH2}\nBob\nbob@example.com\n1000000002\n1000000003\n${HASH}\nSecond\n\0`;

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
        const entries = unwrap(res);
        t.is(entries.length, 2);
        t.is(entries[0].message, "First");
        t.is(entries[1].message, "Second");
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
