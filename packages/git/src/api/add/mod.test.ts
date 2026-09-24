import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { add } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git add` prints nothing worth reading, so the stub never writes to `context.stdout`. */
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

test("Stages the whole working tree when given no paths", async t => {
    const { calls, git } = createContext();

    const res = await add(git, "/fake", []);

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["add", "-A", "--", "."]]);
    t.is(calls[0].context.cwd, "/fake");
});

test("Stages only what git already tracks when asked to update", async t => {
    const { calls, git } = createContext();

    await add(git, "/fake", [], { update: true });

    t.deepEqual(calls.map(call => call.args), [["add", "-u", "--", "."]]);
});

test("Keeps a path that looks like an option on the path side of the separator", async t => {
    const { calls, git } = createContext();

    await add(git, "/fake", ["-dash.txt", "file.txt"]);

    t.deepEqual(calls.map(call => call.args), [["add", "-A", "--", "-dash.txt", "file.txt"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext();

    await add(git, "/fake", [String.raw`c:\repo\file.txt`], { update: true });

    t.deepEqual(calls.map(call => call.args), [["add", "-u", "--", String.raw`C:\repo\file.txt`]]);
});

test("Splits a long list of paths across invocations, repeating the flags on each", async t => {
    const { calls, git } = createContext();
    const paths = Array.from({ length: 2000 }, (_, i) => `untracked-with-a-reasonably-long-filename-${i}.txt`);

    const res = await add(git, "/fake", paths);

    t.true(isOk(res));
    t.true(calls.length > 1);
    t.deepEqual(calls.flatMap(call => call.args.slice(3)), paths);
    for (const call of calls) {
        t.deepEqual(call.args.slice(0, 3), ["add", "-A", "--"]);
    }
});

test("Stops at the first chunk git rejects, and reports why", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: pathspec 'missing.txt' did not match any files\n",
        stdout: "",
    });
    const { calls, git } = createContext(err(rejection));
    const paths = Array.from({ length: 2000 }, (_, i) => `untracked-with-a-reasonably-long-filename-${i}.txt`);

    const res = await add(git, "/fake", paths);

    t.is(calls.length, 1);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await add(git, "/fake", ["file.txt"], { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls[0].context.env, { LC_ALL: "en_US.UTF-8" });
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await add(git, "/fake", []);

    t.is(calls[0].context.timeout, Number.POSITIVE_INFINITY);
});
