import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { update } from "./update.js";

type Invocation = { context: CLIContext; args: string[] };

/** The result is only read for success or failure, so the stub never writes to `context.stdout`. */
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

const MANY_PATHS = Array.from({ length: 2000 }, (_, i) => `submodule-with-a-reasonably-long-path-${i}`);

test("Updates every given submodule in a single invocation", async t => {
    const { calls, git } = createContext();

    const res = await update(git, "/fake", ["sub", "libs/other"]);

    t.true(isOk(res));
    t.deepEqual(calls.map(call => call.args), [["submodule", "update", "--", "sub", "libs/other"]]);
    t.deepEqual(calls.map(call => call.context.cwd), ["/fake"]);
});

test("Does not run git when given no paths", async t => {
    const { calls, git } = createContext();

    const res = await update(git, "/fake", []);

    t.true(isOk(res));
    t.is(calls.length, 0);
});

test("Splits a pathspec past the command-line limit across invocations", async t => {
    const { calls, git } = createContext();

    await update(git, "/fake", MANY_PATHS);

    t.true(calls.length > 1);
    t.deepEqual(calls.flatMap(call => call.args.slice(3)), MANY_PATHS);
    t.true(calls.every(call => call.args.slice(0, 3).join(" ") === "submodule update --"));
});

test("Stops at the first chunk git refuses", async t => {
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

    const res = await update(git, "/fake", MANY_PATHS);

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), rejection);
    }
    t.is(calls.length, 1);
});

test("Keeps a path that looks like an option on the path side of the separator", async t => {
    const { calls, git } = createContext();

    await update(git, "/fake", ["--init"]);

    t.deepEqual(calls.map(call => call.args), [["submodule", "update", "--", "--init"]]);
});

test("Uppercases a Windows drive letter before handing the path to git", async t => {
    const { calls, git } = createContext();

    await update(git, "/fake", [String.raw`c:\repo\sub`]);

    t.deepEqual(calls.map(call => call.args), [["submodule", "update", "--", String.raw`C:\repo\sub`]]);
});

test("Hands the given environment to git", async t => {
    const { calls, git } = createContext();

    await update(git, "/fake", ["sub"], { env: { GIT_EXEC_PATH: "/libexec/git-core" } });

    t.deepEqual(calls.map(call => call.context.env), [{ GIT_EXEC_PATH: "/libexec/git-core" }]);
});

test("Is not cut short by the shared invocation timeout", async t => {
    const { calls, git } = createContext();

    await update(git, "/fake", ["sub"]);

    t.deepEqual(calls.map(call => call.context.timeout), [Number.POSITIVE_INFINITY]);
});
