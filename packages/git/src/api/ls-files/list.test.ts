import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { lsFiles } from "./list.js";

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
        const [lsFilesEntry, ...extras] = unwrap(res);
        t.is(extras.length, 0);
        if (t.assert(lsFilesEntry)) {
            t.like(lsFilesEntry, {
                mode: "100644",
                object: "db4eff851028003f9df7747b2ad58622b307bb6a",
                stage: "0",
                file: "README.md",
            });
        }
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
        const [lsFilesEntry, ...extras] = unwrap(res);
        t.is(extras.length, 0);
        if (t.assert(lsFilesEntry)) {
            t.like(lsFilesEntry, {
                mode: "100755",
                stage: "0",
                file: "script.sh",
            });
        }
    }
});
