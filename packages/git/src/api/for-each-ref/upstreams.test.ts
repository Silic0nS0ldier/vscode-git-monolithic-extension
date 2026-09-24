import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { upstreams } from "./upstreams.js";

function createContext(stdout: string): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(stdout).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "",
            version: "UNSET",
        },
    };
}

test("Lists every local branch by default", async t => {
    const { calls, git } = createContext("");

    await upstreams(git, "/fake");

    t.deepEqual(calls[0], [
        "for-each-ref",
        "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream:track)",
        "refs/heads",
    ]);
});

test("Narrows the listing to the given patterns", async t => {
    const { calls, git } = createContext("");

    await upstreams(git, "/fake", ["refs/heads/feature"]);

    t.deepEqual(calls[0].slice(2), ["refs/heads/feature"]);
});

test("Reports what each branch tracks, and whether the tracking ref is gone", async t => {
    const { git } = createContext(
        "refs/heads/main\0origin\0refs/heads/main\0[behind 2]\n"
            + "refs/heads/nested/topic\0fork\0refs/heads/topic\0[gone]\n",
    );

    const res = await upstreams(git, "/fake");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            { branch: "main", gone: false, ref: "refs/heads/main", remote: "origin" },
            { branch: "nested/topic", gone: true, ref: "refs/heads/topic", remote: "fork" },
        ]);
    }
});

test("Skips branches that track nothing, or track another local branch", async t => {
    const { git } = createContext(
        "refs/heads/loose\0\0\0\n"
            + "refs/heads/stacked\0.\0refs/heads/main\0\n"
            + "refs/heads/main\0origin\0refs/heads/main\0\n",
    );

    const res = await upstreams(git, "/fake");

    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [{ branch: "main", gone: false, ref: "refs/heads/main", remote: "origin" }]);
    }
});
