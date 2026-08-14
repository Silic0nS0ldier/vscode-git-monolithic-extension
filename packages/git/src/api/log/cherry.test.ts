import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { cherry } from "./cherry.js";

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

test("Parses equivalent and unique entries", async t => {
    const { git } = createContext(
        "= c351345 Equivalent upstream change\n+ a1b2c3d Genuinely new commit\n",
    );

    const res = await cherry(git, "/fake", "main...origin/main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            { hash: "c351345", status: "equivalent", subject: "Equivalent upstream change" },
            { hash: "a1b2c3d", status: "unique", subject: "Genuinely new commit" },
        ]);
    }
});

test("Keeps entries in the order git reports them, equivalent or not first", async t => {
    const { git } = createContext(
        "+ a1b2c3d Genuinely new commit\n= c351345 Equivalent upstream change\n",
    );

    const res = await cherry(git, "/fake", "main...origin/main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res).map(entry => entry.status), ["unique", "equivalent"]);
    }
});

test("Yields nothing when the sides don't diverge", async t => {
    const { git } = createContext("");

    const res = await cherry(git, "/fake", "main...main");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});

test("Invokes log with the given range", async t => {
    const { calls, git } = createContext("");

    await cherry(git, "/fake", "main...origin/main");

    t.deepEqual(calls, [["log", "--oneline", "--cherry", "main...origin/main", "--"]]);
});
