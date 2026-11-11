import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { unwrapOk } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
import { log, logWithSources } from "./mod.js";

const HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

test("Single commit, no parents", async t => {
    // Format: hash\nauthorName\nauthorEmail\nauthorDate\ncommitDate\nparents\nmessage\0
    const raw = `${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\nInitial commit\n\0`;

    const gitContext: GitContext = {
        cli: (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return Promise.resolve(ok(void 0));
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
        cli: (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return Promise.resolve(ok(void 0));
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
        cli: (context) => {
            if (context.stdout) {
                intoStream(raw).pipe(context.stdout);
            }
            return Promise.resolve(ok(void 0));
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
        cli: (context) => {
            if (context.stdout) {
                intoStream("").pipe(context.stdout);
            }
            return Promise.resolve(ok(void 0));
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
        cli: (context, args) => {
            t.deepEqual(args, [
                "-c",
                "i18n.logOutputEncoding=UTF-8",
                "log",
                "-n51",
                "--format=%H%n%aN%n%aE%n%at%n%ct%n%P%n%B",
                "-z",
                "--topo-order",
                "--skip=2",
                "abc123",
                "--shortstat",
                "--numstat",
                "--follow",
                "--",
                "renamed.txt",
            ]);
            intoStream("").pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    t.deepEqual(
        unwrapOk(
            await log(git, "/repo", {
                maxEntries: 51,
                skip: 2,
                hash: "abc123",
                topoOrder: true,
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
        cli: () => {
            t.fail("Invalid pagination must not run git");
            return Promise.resolve(ok(undefined));
        },
    };
    t.true(isErr(await log(git, "/repo", { maxEntries: -1 })));
    t.true(isErr(await log(git, "/repo", { skip: 1.5 })));
    t.true(isErr(await log(git, "/repo", { hash: "--all" })));
    t.true(isErr(await log(git, "/repo", { follow: true })));
});

test("Traverses captured tips through stdin and attributes commits to their source", async t => {
    const tip = "a".repeat(40);
    const other = "b".repeat(40);
    const git: GitContext = {
        path: "",
        version: "",
        cli: async (context, args) => {
            t.deepEqual(args, [
                "-c",
                "i18n.logOutputEncoding=UTF-8",
                "log",
                "-n3",
                "--format=%H%n%aN%n%aE%n%at%n%ct%n%P%n%S%n%B",
                "-z",
                "--topo-order",
                "--skip=2",
                "--stdin",
                "--",
            ]);
            let input = "";
            for await (const chunk of context.stdin!) input += String(chunk);
            t.is(input, `${tip}\n${other}\n`);
            intoStream(`${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\n${tip}\nSubject\n\nBody\n\0`)
                .pipe(context.stdout!);
            return ok(undefined);
        },
    };
    const commits = unwrapOk(
        await logWithSources(git, "/repo", {
            hashes: [tip, other],
            maxEntries: 3,
            skip: 2,
        }),
    );
    t.is(commits[0]?.source, tip);
    t.is(commits[0]?.message, "Subject\n\nBody");
});

test("Rejects invalid sourced-log tips and unexpected sources", async t => {
    const tip = "a".repeat(40);
    let calls = 0;
    const git: GitContext = {
        path: "",
        version: "",
        cli: context => {
            calls++;
            intoStream(`${HASH}\nAlice\nalice@example.com\n1000000000\n1000000001\n\n${HASH}\nSubject\n\0`)
                .pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    t.true(isErr(await logWithSources(git, "/repo", { hashes: [] })));
    t.true(isErr(await logWithSources(git, "/repo", { hashes: ["--all"] })));
    t.is(calls, 0);
    t.true(isErr(await logWithSources(git, "/repo", { hashes: [tip] })));
    t.is(calls, 1);
});

test("Sourced logs preserve empty messages and SHA-256 source hashes", async t => {
    const tip = "a".repeat(64);
    const git: GitContext = {
        path: "",
        version: "",
        cli: context => {
            intoStream(`${tip}\nAlice\nalice@example.com\n1000000000\n1000000001\n\n${tip}\n\0`)
                .pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    const commits = unwrapOk(await logWithSources(git, "/repo", { hashes: [tip] }));
    t.is(commits[0]?.hash, tip);
    t.is(commits[0]?.source, tip);
    t.is(commits[0]?.message, "");
});
