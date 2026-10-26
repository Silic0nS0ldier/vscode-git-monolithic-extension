import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { checkout } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git checkout -q` prints nothing worth reading, so the stub never writes to `context.stdout`. */
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

const LONG_PATHS = Array.from({ length: 2000 }, (_, i) => `modified-with-a-reasonably-long-filename-${i}.txt`);

test("Switches to the treeish with no path separator when given no paths", async t => {
    const { calls, git } = createContext();

    const res = await checkout(git, "/fake", "main", []);

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["checkout", "-q", "main"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Places --track and --detach ahead of the treeish", async t => {
    const tracked = createContext();
    const detached = createContext();

    await checkout(tracked.git, "/fake", "origin/feature", [], { track: true });
    await checkout(detached.git, "/fake", "main", [], { detach: true });

    t.deepEqual(tracked.calls.map(call => call.args), [["checkout", "-q", "--track", "origin/feature"]]);
    t.deepEqual(detached.calls.map(call => call.args), [["checkout", "-q", "--detach", "main"]]);
});

test("Omits an empty treeish, so paths are restored from the index", async t => {
    const { calls, git } = createContext();

    await checkout(git, "/fake", "", ["-dash.txt", "file.txt"]);

    t.deepEqual(calls.map(call => call.args), [["checkout", "-q", "--", "-dash.txt", "file.txt"]]);
});

test("Runs a bare checkout when given neither a treeish nor paths", async t => {
    const { calls, git } = createContext();

    await checkout(git, "/fake", "", []);

    t.deepEqual(calls.map(call => call.args), [["checkout", "-q"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext();

    await checkout(git, "/fake", "HEAD", [String.raw`c:\repo\file.txt`]);

    t.deepEqual(calls.map(call => call.args), [["checkout", "-q", "HEAD", "--", String.raw`C:\repo\file.txt`]]);
});

test("Splits a long list of paths across invocations, repeating the treeish on each", async t => {
    const { calls, git } = createContext();

    const res = await checkout(git, "/fake", "HEAD~", LONG_PATHS);

    t.true(isOk(res));
    t.true(calls.length > 1);
    t.deepEqual(calls.flatMap(call => call.args.slice(4)), LONG_PATHS);
    for (const call of calls) {
        t.deepEqual(call.args.slice(0, 4), ["checkout", "-q", "HEAD~", "--"]);
    }
});

test("Stops at the first chunk git rejects, and reports why", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 1,
        signal: null,
        stderr: "error: pathspec 'missing' did not match any file(s) known to git\n",
        stdout: "",
    });
    const { calls, git } = createContext(err(rejection));

    const res = await checkout(git, "/fake", "", LONG_PATHS);

    t.is(calls.length, 1);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await checkout(git, "/fake", "main", [], { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await checkout(git, "/fake", "", ["file.txt"]);

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
