import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { ERROR_GENERIC } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
import { supportsTrackedWithBranch, trackedWithBranch } from "./tracked-with-branch.js";

const OID = "fd81b734cb24103bc31d1b1577587485ccce60cb";
const MODES =
    "N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 9ddeb5c4846e8d831655fbafc24f9fe331753a77";

/** Feeds `chunks` to stdout as separate writes, so records can straddle them. */
function contextStreaming(chunks: string[], version = "2.53.0"): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];
    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(chunks).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "PATH",
            version,
        },
    };
}

test("Reads HEAD, its upstream and every kind of change from one status", async t => {
    const { calls, git } = contextStreaming([
        [
            `# branch.oid ${OID}`,
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -3",
            `1 M. ${MODES} staged.txt`,
            `1 .M ${MODES} with space.txt`,
            `2 R. ${MODES} R100 new name.txt`,
            "old name.txt",
            `u UU N... 100644 100644 100644 100644 ${OID} ${OID} ${OID} conflicted.txt`,
        ].join("\0") + "\0",
    ]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), {
            files: [
                { path: "staged.txt", rename: undefined, x: "M", y: " " },
                { path: "with space.txt", rename: undefined, x: " ", y: "M" },
                { path: "old name.txt", rename: "new name.txt", x: "R", y: " " },
                { path: "conflicted.txt", rename: undefined, x: "U", y: "U" },
            ],
            head: {
                ahead: 2,
                behind: 3,
                commit: OID,
                name: "main",
                upstream: { name: "main", remote: "origin" },
            },
        });
    }
    t.deepEqual(calls, [["status", "-z", "--porcelain=v2", "--branch", "--untracked-files=no"]]);
});

test("Joins records split across chunks, including a rename's two paths", async t => {
    const output = [
        `# branch.oid ${OID}`,
        "# branch.head main",
        `2 R. ${MODES} R100 new.txt`,
        "old.txt",
        `1 M. ${MODES} after.txt`,
    ].join("\0") + "\0";
    const renameSplit = output.indexOf("old.txt") - 1;
    const { git } = contextStreaming([
        output.slice(0, 20),
        output.slice(20, renameSplit),
        output.slice(renameSplit, renameSplit + 3),
        output.slice(renameSplit + 3),
    ]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).files, [
            { path: "old.txt", rename: "new.txt", x: "R", y: " " },
            { path: "after.txt", rename: undefined, x: "M", y: " " },
        ]);
        t.is(unwrap(res).head.name, "main");
    }
});

test("A detached HEAD has a commit but no name", async t => {
    const { git } = contextStreaming([`# branch.oid ${OID}\0# branch.head (detached)\0`]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).head, {
            ahead: undefined,
            behind: undefined,
            commit: OID,
            name: undefined,
            upstream: undefined,
        });
    }
});

test("A branch without commits has a name but no commit", async t => {
    const { git } = contextStreaming(["# branch.oid (initial)\0# branch.head fresh\0"]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).head, {
            ahead: undefined,
            behind: undefined,
            commit: undefined,
            name: "fresh",
            upstream: undefined,
        });
    }
});

test("A gone upstream keeps its name but reports no distance", async t => {
    const { git } = contextStreaming([`# branch.oid ${OID}\0# branch.head main\0# branch.upstream origin/gone\0`]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).head.upstream, { name: "gone", remote: "origin" });
        t.is(unwrap(res).head.ahead, undefined);
    }
});

test("Leaves out nested repositories, as tracked does", async t => {
    const { git } = contextStreaming([`# branch.head main\0` + `1 .M ${MODES} nested/\0`]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).files, []);
    }
});

test("Rejects a distance git would never print", async t => {
    const { git } = contextStreaming(["# branch.head main\0# branch.ab +1 -x\0"]);

    const res = await trackedWithBranch(git, "/cwd");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});

test("Passes --ignore-submodules through", async t => {
    const { calls, git } = contextStreaming([""]);

    await trackedWithBranch(git, "/cwd", { ignoreSubmodules: true });

    t.deepEqual(calls, [["status", "-z", "--porcelain=v2", "--branch", "--untracked-files=no", "--ignore-submodules"]]);
});

test("Needs git 2.11 or later", t => {
    t.false(supportsTrackedWithBranch(contextStreaming([], "2.10.5").git));
    t.true(supportsTrackedWithBranch(contextStreaming([], "2.11.0").git));
});
