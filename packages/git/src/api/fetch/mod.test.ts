import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { fetch } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };

function createContext(result: Result<void, CLIErrors> = ok(void 0)): { git: GitContext; calls: Invocation[] } {
    const calls: Invocation[] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push({ args, context });
                context.stdout?.end();
                return result;
            },
            path: "",
            version: "UNSET",
        },
    };
}

test("Fetches the default remote when given no options", async t => {
    const { calls, git } = createContext();

    const res = await fetch(git, "/fake");

    t.true(isOk(res));
    t.deepEqual(calls[0].args, ["fetch"]);
    t.is(calls[0].context.cwd, "/fake");
});

test("Fetches a single ref from a named remote", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { ref: "main", remote: "origin" });

    t.deepEqual(calls[0].args, ["fetch", "origin", "main"]);
});

test("Fetches every remote when no remote is named", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { all: true });

    t.deepEqual(calls[0].args, ["fetch", "--all"]);
});

test("Applies pruning and depth after the remote", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { depth: 1, prune: true, ref: "main", remote: "origin" });

    t.deepEqual(calls[0].args, ["fetch", "origin", "main", "--prune", "--depth=1"]);
});

test("Advertises the given user agent to HTTP remotes", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { userAgent: "git/2.0 vscode/1.0" });

    t.is(calls[0].context.env?.["GIT_HTTP_USER_AGENT"], "git/2.0 vscode/1.0");
});

test("Carries caller supplied environment through, and lets the user agent win", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", {
        env: { GIT_ASKPASS: "/askpass.sh", GIT_HTTP_USER_AGENT: "stale" },
        userAgent: "git/2.0",
    });

    t.is(calls[0].context.env?.["GIT_ASKPASS"], "/askpass.sh");
    t.is(calls[0].context.env?.["GIT_HTTP_USER_AGENT"], "git/2.0");
});

test("Forwards the abort signal", async t => {
    const { calls, git } = createContext();
    const controller = new AbortController();

    await fetch(git, "/fake", { signal: controller.signal });

    t.is(calls[0].context.signal, controller.signal);
});

test("Leaves the invocation unbounded, since a remote sets the pace", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake");

    t.false(Number.isFinite(calls[0].context.timeout ?? Number.POSITIVE_INFINITY));
});

test("Reports a failed invocation", async t => {
    const failure = createError(ERROR_GENERIC);
    const { git } = createContext(err(failure));

    const res = await fetch(git, "/fake");

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res), failure);
    }
});
