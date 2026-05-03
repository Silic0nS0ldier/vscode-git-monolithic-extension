import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { lsTree } from "./list.js";
import type { GitContext } from "../../cli/context.js";

test("Single file entry", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100644 blob db4eff851028003f9df7747b2ad58622b307bb6a      42    README.md").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await lsTree(gitContext, "/fake", "HEAD", "README.md");
    t.true(isOk(res));
    if (isOk(res)) {
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.is(entries[0].mode, "100644");
        t.is(entries[0].type, "blob");
        t.is(entries[0].object, "db4eff851028003f9df7747b2ad58622b307bb6a");
        t.is(entries[0].size, "42");
        t.is(entries[0].file, "README.md");
    }
});

test("Empty output when path not in tree", async t => {
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

    const res = await lsTree(gitContext, "/fake", "HEAD", "nonexistent.txt");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), []);
    }
});

test("Executable file entry", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100755 blob abc123def456abc123def456abc123def456abc1234       0    script.sh").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };

    const res = await lsTree(gitContext, "/fake", "HEAD", "script.sh");
    t.true(isOk(res));
    if (isOk(res)) {
        const entries = unwrap(res);
        t.is(entries.length, 1);
        t.is(entries[0].mode, "100755");
        t.is(entries[0].file, "script.sh");
    }
});
