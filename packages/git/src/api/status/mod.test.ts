import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { ERROR_GENERIC } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
import { status, supportsStatus } from "./mod.js";

const MODES =
    "N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 9ddeb5c4846e8d831655fbafc24f9fe331753a77";

/** Feeds `chunks` to stdout as separate writes, so records can straddle them. */
function contextStreaming(
    chunks: string[],
    version = "2.53.0",
): { calls: string[][]; envs: (Record<string, string | undefined> | undefined)[]; git: GitContext } {
    const calls: string[][] = [];
    const envs: (Record<string, string | undefined> | undefined)[] = [];
    return {
        calls,
        envs,
        git: {
            cli: (context, args) => {
                calls.push(args);
                envs.push(context.env);
                if (context.stdout) {
                    intoStream(chunks).pipe(context.stdout);
                }
                return Promise.resolve(ok(void 0));
            },
            path: "PATH",
            version,
        },
    };
}

test("Lists untracked entries alongside tracked changes, keeping a collapsed folder's trailing slash", async t => {
    const { calls, git } = contextStreaming([
        ["# branch.head main", `1 .M ${MODES} tracked.txt`, "? new/", "? root.txt", "? :(icase)odd name/"]
            .join("\0") + "\0",
    ]);

    const res = await status(git, "/cwd", { untracked: "normal" });

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).files, [{ path: "tracked.txt", rename: undefined, x: " ", y: "M" }]);
        t.deepEqual(unwrap(res).untracked, ["new/", "root.txt", ":(icase)odd name/"]);
    }
    t.deepEqual(calls, [["status", "-z", "--porcelain=v2", "--branch", "--untracked-files=normal"]]);
});

test("Joins an untracked entry split across chunks", async t => {
    const output = "# branch.head main\0? first.txt\0? second/\0";
    const split = output.indexOf("second") + 2;
    const { git } = contextStreaming([output.slice(0, split), output.slice(split)]);

    const res = await status(git, "/cwd", { untracked: "all" });

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).untracked, ["first.txt", "second/"]);
    }
});

test("Rejects untracked entries when none were asked for", async t => {
    const { git } = contextStreaming(["# branch.head main\0? surprise.txt\0"]);

    const res = await status(git, "/cwd", { untracked: "no" });

    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});

test("Rejects ignored entries, which are never asked for", async t => {
    const { git } = contextStreaming(["# branch.head main\0! ignored.log\0"]);

    const res = await status(git, "/cwd", { untracked: "normal" });

    t.true(isErr(res));
});

test("Asks for the given untracked mode", async t => {
    for (const untracked of ["no", "normal", "all"] as const) {
        const { calls, git } = contextStreaming([""]);

        await status(git, "/cwd", { untracked });

        t.deepEqual(calls, [["status", "-z", "--porcelain=v2", "--branch", `--untracked-files=${untracked}`]]);
    }
});

test("Hides untracked content in submodules by defaulting diff.ignoreSubmodules", async t => {
    const { calls, git } = contextStreaming([""]);

    await status(git, "/cwd", { hideUntrackedInSubmodules: true, untracked: "normal" });

    t.deepEqual(calls, [[
        "-c",
        "diff.ignoreSubmodules=untracked",
        "status",
        "-z",
        "--porcelain=v2",
        "--branch",
        "--untracked-files=normal",
    ]]);
});

test("Ignoring submodules entirely leaves no default to set", async t => {
    const { calls, git } = contextStreaming([""]);

    await status(git, "/cwd", { hideUntrackedInSubmodules: true, ignoreSubmodules: true, untracked: "normal" });

    t.deepEqual(calls, [[
        "status",
        "-z",
        "--porcelain=v2",
        "--branch",
        "--untracked-files=normal",
        "--ignore-submodules",
    ]]);
});

test("Needs git 2.11 or later", t => {
    t.false(supportsStatus(contextStreaming([], "2.10.5").git));
    t.true(supportsStatus(contextStreaming([], "2.11.0").git));
});

test("Disables optional locks via GIT_OPTIONAL_LOCKS=0 only when optionalLocks is false", async t => {
    const disabled = contextStreaming([""]);
    await status(disabled.git, "/cwd", { optionalLocks: false, untracked: "normal" });
    t.deepEqual(disabled.envs, [{ GIT_OPTIONAL_LOCKS: "0" }]);

    for (const optionalLocks of [undefined, true] as const) {
        const enabled = contextStreaming([""]);
        await status(enabled.git, "/cwd", { optionalLocks, untracked: "normal" });
        t.deepEqual(enabled.envs, [undefined]);
    }
});
