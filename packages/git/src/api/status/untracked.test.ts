import test from "ava";
import intoStream from "into-stream";
import type { CLIContext, GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { untracked } from "./untracked.js";

/** Answers each call with the next of `outputs`, recording its args and env. */
function contextAnswering(outputs: string[]): { git: GitContext; calls: { args: string[]; env: CLIContext["env"] }[] } {
    const calls: { args: string[]; env: CLIContext["env"] }[] = [];
    return {
        calls,
        git: {
            cli: (context, args) => {
                calls.push({ args, env: context.env });
                if (context.stdout) {
                    intoStream(outputs[calls.length - 1] ?? "").pipe(context.stdout);
                }
                return Promise.resolve(ok(void 0));
            },
            path: "PATH",
            version: "VERSION",
        },
    };
}

test("Basic case", async t => {
    const res = await untracked(
        {
            cli: (context) => {
                if (context.stdout) {
                    intoStream(
                        [
                            "packages/git/src/api/status/tracked.test.ts",
                            "packages/git/src/api/status/untracked.test.ts",
                        ].join("\0") + "\0",
                    ).pipe(context.stdout);
                }
                return Promise.resolve(ok(void 0));
            },
            path: "PATH",
            version: "VERSION",
        },
        "/cwd",
        "relative",
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            "packages/git/src/api/status/tracked.test.ts",
            "packages/git/src/api/status/untracked.test.ts",
        ]);
    }
});

test("Scoped to paths, takes each literally and clears inherited pathspec settings", async t => {
    const { calls, git } = contextAnswering(["new/a.txt\0:colon/colon.txt\0"]);

    const res = await untracked(git, "/cwd", "relative", { paths: ["new/", ":colon/"] });

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), ["new/a.txt", ":colon/colon.txt"]);
    }
    t.deepEqual(calls, [{
        args: ["--literal-pathspecs", "ls-files", "-z", "--others", "--exclude-standard", "--", "new/", ":colon/"],
        env: { GIT_GLOB_PATHSPECS: undefined, GIT_ICASE_PATHSPECS: undefined, GIT_NOGLOB_PATHSPECS: undefined },
    }]);
});

test("Scoped to no paths, lists nothing without running git", async t => {
    const { calls, git } = contextAnswering([]);

    const res = await untracked(git, "/cwd", "relative", { paths: [] });

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
    t.deepEqual(calls, []);
});

test("Scoped to more paths than fit on one command line, lists them across invocations", async t => {
    const paths = Array.from({ length: 1000 }, (_, i) => `untracked-folder-with-a-reasonably-long-name-${i}/`);
    const { calls, git } = contextAnswering(["first/a.txt\0", "second/b.txt\0"]);

    const res = await untracked(git, "/cwd", "relative", { paths });

    t.is(calls.length, 2);
    t.deepEqual(calls.flatMap(call => call.args.slice(call.args.indexOf("--") + 1)), paths);
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), ["first/a.txt", "second/b.txt"]);
    }
});
