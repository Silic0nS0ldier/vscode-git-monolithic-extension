import test from "ava";
import intoStream from "into-stream";
import type { CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError, ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { hasAny } from "./has-any.js";

/** Pipes `stdout` into, and ends, `context.stdout` on every path, or the read never resolves. */
function createContext(
    stdout: string,
    result: Result<void, CLIErrors> = ok(void 0),
): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(stdout).pipe(context.stdout);
                }
                return result;
            },
            path: "",
            version: "UNSET",
        },
    };
}

test("Invokes branch with no arguments", async t => {
    const { calls, git } = createContext("");

    await hasAny(git, "/fake");

    t.deepEqual(calls, [["branch"]]);
});

test("Reports no branches when git lists none", async t => {
    const { git } = createContext("");

    const res = await hasAny(git, "/fake");

    t.true(isOk(res));
    t.false(unwrapOk(res));
});

test("Reports branches when git lists any", async t => {
    const { git } = createContext("* main\n  side\n");

    const res = await hasAny(git, "/fake");

    t.true(isOk(res));
    t.true(unwrapOk(res));
});

test("Counts a detached HEAD as a branch, as git lists it", async t => {
    const { git } = createContext("* (HEAD detached at 1234567)\n");

    const res = await hasAny(git, "/fake");

    t.true(unwrapOk(res));
});

test("Reports branches without reading a listing too long to hold", async t => {
    const { git } = createContext(`  ${"b".repeat(1024)}\n`.repeat(1024));

    const res = await hasAny(git, "/fake");

    t.true(isOk(res));
    t.true(unwrapOk(res));
});

test("Reports why git refused", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",
    });
    const { git } = createContext("", err(rejection));

    const res = await hasAny(git, "/fake");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_NON_ZERO_EXIT);
    }
});
