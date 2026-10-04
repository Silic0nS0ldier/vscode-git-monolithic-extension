import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { rm } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git rm` prints nothing worth reading, so the stub never writes to `context.stdout`. */
function createContext(result: Result<void, CLIErrors> = ok(void 0)): { git: GitContext; calls: Invocation[] } {
    const calls: Invocation[] = [];
    const git: GitContext = {
        cli: async (context, args) => {
            calls.push({ args, context });
            return result;
        },
        path: "",
        version: "UNSET",
    };

    return { calls, git };
}

test("Removes every given path in a single invocation", async t => {
    const { calls, git } = createContext();

    const res = await rm(git, "/fake", ["a.txt", "nested/b.txt"]);

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["rm", "--", "a.txt", "nested/b.txt"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Does not run git when given no paths", async t => {
    const { calls, git } = createContext();

    const res = await rm(git, "/fake", []);

    t.true(isOk(res));
    t.is(calls.length, 0);
});

test("Keeps a path that looks like an option on the path side of the separator", async t => {
    const { calls, git } = createContext();

    await rm(git, "/fake", ["-r"]);

    t.deepEqual(calls.map(call => call.args), [["rm", "--", "-r"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext();

    await rm(git, "/fake", [String.raw`c:\repo\file.txt`]);

    t.deepEqual(calls.map(call => call.args), [["rm", "--", String.raw`C:\repo\file.txt`]]);
});

test("Reports why git refused", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: pathspec 'missing.txt' did not match any files\n",
        stdout: "",
    });
    const { git } = createContext(err(rejection));

    const res = await rm(git, "/fake", ["missing.txt"]);

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await rm(git, "/fake", ["file.txt"], { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await rm(git, "/fake", ["file.txt"]);

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
