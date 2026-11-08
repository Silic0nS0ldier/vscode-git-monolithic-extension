import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { unwrapOk } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
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

test("Builds a bounded, UTF-8, rename-aware history query", async t => {
    const git: GitContext = {
        path: "",
        version: "2.50.0",
        cli: async (context, args) => {
            t.deepEqual(args, [
                "-c",
                "i18n.logOutputEncoding=UTF-8",
                "log",
                "-n51",
                "--format=%H%n%aN%n%aE%n%at%n%ct%n%P%n%B",
                "-z",
                "--skip=2",
                "abc123",
                "--shortstat",
                "--numstat",
                "--follow",
                "--",
                "renamed.txt",
            ]);
            intoStream("").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.deepEqual(
        unwrapOk(
            await log(git, "/repo", {
                maxEntries: 51,
                skip: 2,
                hash: "abc123",
                shortStats: true,
                filePaths: true,
                follow: true,
                path: "renamed.txt",
            }),
        ),
        [],
    );
});

test("Rejects invalid paging inputs without executing git", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async () => {
            t.fail("Invalid pagination must not run git");
            return ok(undefined);
        },
    };
    t.true(isErr(await log(git, "/repo", { maxEntries: -1 })));
    t.true(isErr(await log(git, "/repo", { skip: 1.5 })));
    t.true(isErr(await log(git, "/repo", { hash: "--all" })));
    t.true(isErr(await log(git, "/repo", { follow: true })));
});
