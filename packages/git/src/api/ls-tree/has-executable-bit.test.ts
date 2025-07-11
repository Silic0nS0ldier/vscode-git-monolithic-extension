import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { hasExecutableBit } from "./has-executable-bit.js";
import type { GitContext } from "../../cli/context.js";

test("Non-executable file", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100644 blob db4eff851028003f9df7747b2ad58622b307bb6a    MODULE.bazel").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };
    const res = await hasExecutableBit(
        gitContext,
        "/fake",
        "foo",
        "HEAD",
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), false);
    }
});

test("Executable file", async t => {
    const gitContext: GitContext = {
        cli: async (context) => {
            if (context.stdout) {
                intoStream("100755 blob db4eff851028003f9df7747b2ad58622b307bb6a    MODULE.bazel").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "UNSET",
    };
    const res = await hasExecutableBit(
        gitContext,
        "/fake",
        "foo",
        "HEAD",
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), true);
    }
});
