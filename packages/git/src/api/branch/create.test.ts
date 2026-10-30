import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { create } from "./create.js";

type Invocation = { context: CLIContext; args: string[] };

/** Runs with `-q`, so the stub never writes to `context.stdout`. */
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

test("Creates a branch at HEAD", async t => {
    const { calls, git } = createContext();

    const res = await create(git, "/fake", "topic");

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["branch", "-q", "topic"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Creates a branch at the given start point", async t => {
    const { calls, git } = createContext();

    await create(git, "/fake", "topic", { startPoint: "main" });

    t.deepEqual(calls.map(call => call.args), [["branch", "-q", "topic", "main"]]);
});

test("Treats an empty start point as none", async t => {
    const { calls, git } = createContext();

    await create(git, "/fake", "topic", { startPoint: "" });

    t.deepEqual(calls.map(call => call.args), [["branch", "-q", "topic"]]);
});

test("Reports why git refused", async t => {
    const error = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: a branch named 'topic' already exists\n",
        stdout: "",
    });
    const { git } = createContext(err(error));

    const res = await create(git, "/fake", "topic");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), error);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await create(git, "/fake", "topic", { env: { LC_ALL: "en_US.UTF-8" } });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await create(git, "/fake", "topic");

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
