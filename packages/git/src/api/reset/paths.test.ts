import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { resetPaths } from "./paths.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git reset -q` prints nothing worth reading, so the stub never writes to `context.stdout`. */
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

test("Resets the whole index when given no paths", async t => {
    const { calls, git } = createContext();

    const res = await resetPaths(git, "/fake", "HEAD", []);

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["reset", "-q", "HEAD", "--", "."]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Keeps a path that looks like an option on the path side of the separator", async t => {
    const { calls, git } = createContext();

    await resetPaths(git, "/fake", "HEAD", ["-dash.txt", "file.txt"]);

    t.deepEqual(calls.map(call => call.args), [["reset", "-q", "HEAD", "--", "-dash.txt", "file.txt"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext();

    await resetPaths(git, "/fake", "HEAD", [String.raw`c:\repo\file.txt`]);

    t.deepEqual(calls.map(call => call.args), [["reset", "-q", "HEAD", "--", String.raw`C:\repo\file.txt`]]);
});

test("Splits a long list of paths across invocations, repeating the treeish on each", async t => {
    const { calls, git } = createContext();
    const paths = Array.from({ length: 2000 }, (_, i) => `staged-with-a-reasonably-long-filename-${i}.txt`);

    const res = await resetPaths(git, "/fake", "HEAD~", paths);

    t.true(isOk(res));
    t.true(calls.length > 1);
    t.deepEqual(calls.flatMap(call => call.args.slice(4)), paths);
    for (const call of calls) {
        t.deepEqual(call.args.slice(0, 4), ["reset", "-q", "HEAD~", "--"]);
    }
});

test("Stops at the first chunk git rejects, and reports why", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: ambiguous argument 'missing': unknown revision or path not in the working tree.\n",
        stdout: "",
    });
    const { calls, git } = createContext(err(rejection));
    const paths = Array.from({ length: 2000 }, (_, i) => `staged-with-a-reasonably-long-filename-${i}.txt`);

    const res = await resetPaths(git, "/fake", "missing", paths);

    t.is(calls.length, 1);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await resetPaths(git, "/fake", "HEAD", ["file.txt"], { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await resetPaths(git, "/fake", "HEAD", []);

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
