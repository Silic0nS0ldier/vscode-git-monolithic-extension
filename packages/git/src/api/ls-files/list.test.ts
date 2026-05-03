import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { lsFiles } from "./list.js";
import type { GitContext } from "../../cli/context.js";

test("Single staged file", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100644 db4eff851028003f9df7747b2ad58622b307bb6a 0\tREADME.md").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await lsFiles(gitContext, "/fake", "README.md");
    t.true(isOk(res));
    if (isOk(res)) {
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.is(entries[0].mode, "100644");
        t.is(entries[0].object, "db4eff851028003f9df7747b2ad58622b307bb6a");
        t.is(entries[0].stage, "0");
        t.is(entries[0].file, "README.md");
    }
});

test("Empty output when file not in index", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await lsFiles(gitContext, "/fake", "nonexistent.txt");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});

test("Executable file in index", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100755 abc123def456abc123def456abc123def456abc1234 0\tscript.sh").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await lsFiles(gitContext, "/fake", "script.sh");
    t.true(isOk(res));
    if (isOk(res)) {
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.is(entries[0].mode, "100755");
        t.is(entries[0].stage, "0");
        t.is(entries[0].file, "script.sh");
    }
});
