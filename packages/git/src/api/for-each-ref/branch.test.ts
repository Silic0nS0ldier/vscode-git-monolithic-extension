import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { branch } from "./branch.js";

const COMMIT = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const TRACKING_FORMAT = "--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)";
const LEGACY_FORMAT = "--format=%(refname)%00%(upstream:short)%00%(objectname)";

function createContext(
    respond: (args: string[]) => string,
    version = "2.43.0",
): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(respond(args)).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "",
            version,
        },
    };
}

test("Reads the upstream and its ahead/behind counts", async t => {
    const { calls, git } = createContext(() => `refs/heads/main\0origin/main\0${COMMIT}\0[ahead 1, behind 2]\n`);

    const res = await branch(git, "/fake", "main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            ahead: 1,
            behind: 2,
            commit: COMMIT,
            kind: "head",
            name: "main",
            upstream: { name: "main", remote: "origin" },
        });
    }

    t.deepEqual(calls, [["for-each-ref", TRACKING_FORMAT, "refs/heads/main", "refs/remotes/main"]]);
});

test("Keeps the upstream of a branch whose remote ref is gone", async t => {
    const { git } = createContext(() => `refs/heads/main\0origin/main\0${COMMIT}\0[gone]\n`);

    const res = await branch(git, "/fake", "main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            ahead: 0,
            behind: 0,
            commit: COMMIT,
            kind: "head",
            name: "main",
            upstream: { name: "main", remote: "origin" },
        });
    }
});

test("Reports no upstream when the branch has none", async t => {
    const { git } = createContext(() => `refs/heads/main\0\0${COMMIT}\0\n`);

    const res = await branch(git, "/fake", "main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            ahead: 0,
            behind: 0,
            commit: COMMIT,
            kind: "head",
            name: "main",
            upstream: undefined,
        });
    }
});

test("Resolves a remote branch", async t => {
    const { calls, git } = createContext(() => `refs/remotes/origin/main\0\0${COMMIT}\0\n`);

    const res = await branch(git, "/fake", "refs/remotes/origin/main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            commit: COMMIT,
            kind: "remote-head",
            name: "main",
            remote: "origin",
        });
    }

    // A fully qualified name is looked up as given, rather than in both namespaces.
    t.deepEqual(calls, [["for-each-ref", TRACKING_FORMAT, "refs/remotes/origin/main"]]);
});

test("Resolves to nothing when no ref matches", async t => {
    const { git } = createContext(() => "");

    const res = await branch(git, "/fake", "missing");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), undefined);
    }
});

test("Counts ahead/behind separately before git 1.9.0", async t => {
    const { calls, git } = createContext(
        args => args[0] === "for-each-ref" ? `refs/heads/main\0origin/main\0${COMMIT}\n` : "3\t4\n",
        "1.8.5",
    );

    const res = await branch(git, "/fake", "main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            ahead: 3,
            behind: 4,
            commit: COMMIT,
            kind: "head",
            name: "main",
            upstream: { name: "main", remote: "origin" },
        });
    }

    t.deepEqual(calls, [
        ["for-each-ref", LEGACY_FORMAT, "refs/heads/main", "refs/remotes/main"],
        ["rev-list", "--left-right", "--count", "main...origin/main"],
    ]);
});
