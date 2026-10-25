import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { reset } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

/** `git reset --soft|--hard` output is not read, so the stub never writes to `context.stdout`. */
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

test("Moves only HEAD for a soft reset", async t => {
    const { calls, git } = createContext();

    const res = await reset(git, "/fake", "HEAD~", { mode: "soft" });

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["reset", "--soft", "HEAD~"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Discards index and work tree changes for a hard reset", async t => {
    const { calls, git } = createContext();

    await reset(git, "/fake", "main", { mode: "hard" });

    t.deepEqual(calls.map(call => call.args), [["reset", "--hard", "main"]]);
});

test("Reports why git refused", async t => {
    const rejection = createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: "fatal: ambiguous argument 'missing': unknown revision or path not in the working tree.\n",
        stdout: "",
    });
    const { git } = createContext(err(rejection));

    const res = await reset(git, "/fake", "missing", { mode: "soft" });

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await reset(git, "/fake", "HEAD~", { env: { LC_ALL: "en_US.UTF-8" }, mode: "soft" });

    t.deepEqual(calls.map(call => call.context.env), [{ LC_ALL: "en_US.UTF-8" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await reset(git, "/fake", "HEAD~", { mode: "hard" });

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
