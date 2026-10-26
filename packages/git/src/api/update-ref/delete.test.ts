import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { deleteRef } from "./delete.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git update-ref -d` prints nothing, so the stub never writes to `context.stdout`. */
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

test("Deletes the given ref", async t => {
    const { calls, git } = createContext();

    const res = await deleteRef(git, "/fake", "HEAD");

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["update-ref", "-d", "HEAD"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Reports why git refused", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr:
            "error: cannot lock ref 'refs/heads/main': Unable to create '.git/refs/heads/main.lock': File exists.\n",
        stdout: "",
    });
    const { git } = createContext(err(rejection));

    const res = await deleteRef(git, "/fake", "refs/heads/main");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await deleteRef(git, "/fake", "HEAD", { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await deleteRef(git, "/fake", "HEAD");

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
