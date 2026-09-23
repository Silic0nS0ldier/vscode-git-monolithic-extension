import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { staged, unstaged } from "./path.js";

const DIFF = "diff --git a/file.txt b/file.txt\n";

function createContext(stdout: string): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(stdout).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "",
            version: "UNSET",
        },
    };
}

test("Asks git for the unstaged changes to the named path", async t => {
    const { calls, git } = createContext(DIFF);

    await unstaged(git, "/fake", "file.txt");

    t.deepEqual(calls, [["diff", "--", "file.txt"]]);
});

test("Asks git for the staged changes to the named path", async t => {
    const { calls, git } = createContext(DIFF);

    await staged(git, "/fake", "file.txt");

    t.deepEqual(calls, [["diff", "--cached", "--", "file.txt"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext(DIFF);

    await unstaged(git, "/fake", String.raw`c:\repo\file.txt`);

    t.deepEqual(calls, [["diff", "--", String.raw`C:\repo\file.txt`]]);
});

test("Reports what git printed, verbatim", async t => {
    const { git } = createContext(DIFF);

    const res = await unstaged(git, "/fake", "file.txt");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), DIFF);
    }
});

test("Reports an empty string when the path has no changes", async t => {
    const { git } = createContext("");

    const res = await staged(git, "/fake", "file.txt");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "");
    }
});
