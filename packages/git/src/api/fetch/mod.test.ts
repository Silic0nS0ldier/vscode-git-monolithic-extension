import test from "ava";
import type { CLIContext, CLIErrors, GitContext } from "../../cli/context.js";
import { createError, createNonZeroExitError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, isOk, ok, type Result, unwrap } from "../../func-result.js";
import { fetch } from "./mod.js";

type Invocation = { context: CLIContext; args: string[] };
type Outcome = Result<void, CLIErrors>;

function createContext(
    result: Outcome | ((args: string[]) => Outcome) = ok(void 0),
): { git: GitContext; calls: Invocation[] } {
    const calls: Invocation[] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push({ args, context });
                context.stdout?.end();
                return typeof result === "function" ? result(args) : result;
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

test("Fetches the given refs from a named remote", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { refs: ["main", "refs/heads/feature"], remote: "origin" });

    t.deepEqual(calls[0].args, ["fetch", "origin", "main", "refs/heads/feature"]);
});

test("Fetches the configured refspecs of a named remote when given no refs", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { remote: "origin" });

    t.deepEqual(calls[0].args, ["fetch", "origin"]);
});

test("Fetches nothing when given an empty list of refs", async t => {
    const { calls, git } = createContext();

    const res = await fetch(git, "/fake", { refs: [], remote: "origin" });

    t.true(isOk(res));
    t.is(calls.length, 0);
});

test("Splits a long list of refs across invocations, repeating the flags on each", async t => {
    const { calls, git } = createContext();
    const refs = Array.from({ length: 2000 }, (_, i) => `refs/heads/branch-with-a-long-name-${i}`);

    await fetch(git, "/fake", { prune: true, refs, remote: "origin" });

    t.true(calls.length > 1);
    t.deepEqual(calls.flatMap(call => call.args.slice(2, -1)), refs);
    for (const call of calls) {
        t.deepEqual([call.args[0], call.args[1], call.args.at(-1)], ["fetch", "origin", "--prune"]);
    }
});

function missingRef(ref: string): Outcome {
    return err(createNonZeroExitError({
        args: [],
        cwd: "/fake",
        executablePath: "git",
        exitCode: 128,
        signal: null,
        stderr: `fatal: couldn't find remote ref ${ref}\n`,
        stdout: "",
    }));
}

test("Drops refs the remote no longer has and fetches the rest, when asked to", async t => {
    const { calls, git } = createContext(args =>
        args.includes("refs/heads/a")
            ? missingRef("refs/heads/a")
            : args.includes("refs/heads/b")
            ? missingRef("refs/heads/b")
            : ok(void 0)
    );

    const res = await fetch(git, "/fake", {
        refs: ["refs/heads/a", "refs/heads/main", "refs/heads/b"],
        remote: "origin",
        skipMissingRefs: true,
    });

    t.true(isOk(res));
    t.deepEqual(calls.at(-1)?.args, ["fetch", "origin", "refs/heads/main"]);
});

test("Succeeds without a final invocation when every ref is missing", async t => {
    const { calls, git } = createContext(args => missingRef(args[2]));

    const res = await fetch(git, "/fake", {
        refs: ["refs/heads/a", "refs/heads/b"],
        remote: "origin",
        skipMissingRefs: true,
    });

    t.true(isOk(res));
    t.is(calls.length, 2);
});

test("Reports a missing ref unless asked to skip it", async t => {
    const { calls, git } = createContext(missingRef("refs/heads/a"));

    const res = await fetch(git, "/fake", { refs: ["refs/heads/a"], remote: "origin" });

    t.true(isErr(res));
    t.is(calls.length, 1);
});

test("Reports a missing ref it was not asked for, rather than retrying forever", async t => {
    const { calls, git } = createContext(missingRef("refs/heads/other"));

    const res = await fetch(git, "/fake", { refs: ["refs/heads/a"], remote: "origin", skipMissingRefs: true });

    t.true(isErr(res));
    t.is(calls.length, 1);
});

test("Fetches every remote when no remote is named", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { all: true });

    t.deepEqual(calls[0].args, ["fetch", "--all"]);
});

test("Applies pruning and depth after the remote", async t => {
    const { calls, git } = createContext();

    await fetch(git, "/fake", { depth: 1, prune: true, refs: ["main"], remote: "origin" });

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
