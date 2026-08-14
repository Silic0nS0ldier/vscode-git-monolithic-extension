import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { ERROR_GENERIC } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
import { list } from "./list.js";

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

test("Parses every entry, newest first", async t => {
    const { git } = createContext(
        "stash@{0}: On main: Second stash\nstash@{1}: On main: First stash\n",
    );

    const res = await list(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            { description: " On main: Second stash", index: 0 },
            { description: " On main: First stash", index: 1 },
        ]);
    }
});

test("Yields nothing when the stash is empty", async t => {
    const { git } = createContext("");

    const res = await list(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});

test("Reports an index too large to fit a u32", async t => {
    const { git } = createContext("stash@{99999999999}: On main: Overflowed\n");

    const res = await list(git, "/fake");
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});

test("Invokes stash list", async t => {
    const { calls, git } = createContext("");

    await list(git, "/fake");

    t.deepEqual(calls, [["stash", "list"]]);
});
