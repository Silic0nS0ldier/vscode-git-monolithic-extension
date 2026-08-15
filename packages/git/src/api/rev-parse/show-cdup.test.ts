import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { showCdup } from "./show-cdup.js";

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

test("Asks git for the path from the current directory to the top of the work tree", async t => {
    const { calls, git } = createContext("\n");

    await showCdup(git, "/fake");

    t.deepEqual(calls, [["rev-parse", "--show-cdup"]]);
});

test("Reports the relative path git prints, without its line ending", async t => {
    const { git } = createContext("../../\n");

    const res = await showCdup(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "../../");
    }
});

test("Reports an empty path at the top of a work tree", async t => {
    const { git } = createContext("\n");

    const res = await showCdup(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "");
    }
});

test("Reports an empty path where git prints nothing at all", async t => {
    const { git } = createContext("");

    const res = await showCdup(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "");
    }
});
