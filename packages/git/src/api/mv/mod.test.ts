import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { mv } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git mv` prints nothing worth reading, so the stub never writes to `context.stdout`. */
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

test("Moves the source to the destination in a single invocation", async t => {
    const { calls, git } = createContext();

    const res = await mv(git, "/fake", "nested/a.txt", "b.txt");

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["mv", "nested/a.txt", "b.txt"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Hands both paths to git without an option separator", async t => {
    const { calls, git } = createContext();

    await mv(git, "/fake", "-n", "b.txt");

    t.deepEqual(calls.map(call => call.args), [["mv", "-n", "b.txt"]]);
});

test("Hands both paths to git as given", async t => {
    const { calls, git } = createContext();

    await mv(git, "/fake", String.raw`c:\repo\a.txt`, String.raw`c:\repo\b.txt`);

    t.deepEqual(calls.map(call => call.args), [["mv", String.raw`c:\repo\a.txt`, String.raw`c:\repo\b.txt`]]);
});

test("Reports why git refused", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: destination exists, source=a.txt, destination=b.txt\n",
        stdout: "",
    });
    const { git } = createContext(err(rejection));

    const res = await mv(git, "/fake", "a.txt", "b.txt");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await mv(git, "/fake", "a.txt", "b.txt", { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await mv(git, "/fake", "a.txt", "b.txt");

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
