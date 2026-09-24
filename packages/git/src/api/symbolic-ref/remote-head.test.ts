import test from "ava";
import intoStream from "into-stream";
import type { CLIErrors, GitContext } from "../../cli/context.js";
import { createNonZeroExitError } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { remoteHead } from "./remote-head.js";

function createContext(stdout: string, result: Result<void, CLIErrors> = ok(void 0)): {
    git: GitContext;
    calls: string[][];
} {
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

function exited(exitCode: number): Result<void, CLIErrors> {
    return err(createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode,
        signal: null,
        stderr: "",
        stdout: "",
    }));
}

test("Reads the remote's HEAD symref", async t => {
    const { calls, git } = createContext("refs/remotes/origin/main\n");

    const res = await remoteHead(git, "/fake", "origin");

    t.deepEqual(calls[0], ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "refs/heads/main");
    }
});

test("Keeps the slashes of a nested default branch", async t => {
    const { git } = createContext("refs/remotes/origin/release/2026\n");

    const res = await remoteHead(git, "/fake", "origin");

    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "refs/heads/release/2026");
    }
});

test("Reports no default branch when the symref points outside the remote", async t => {
    const { git } = createContext("refs/remotes/other/main\n");

    const res = await remoteHead(git, "/fake", "origin");

    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), undefined);
    }
});

test("Reports no default branch when the symref is unset", async t => {
    const { git } = createContext("", exited(1));

    const res = await remoteHead(git, "/fake", "origin");

    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), undefined);
    }
});

test("Reports any other failure", async t => {
    const { git } = createContext("", exited(128));

    const res = await remoteHead(git, "/fake", "origin");

    t.true(isErr(res));
});
