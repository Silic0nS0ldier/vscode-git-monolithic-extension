import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { untracked } from "./untracked.js";

test("Basic case", async t => {
    const res = await untracked(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream([
                        "packages/git/src/api/status/tracked.test.ts",
                        "packages/git/src/api/status/untracked.test.ts",

                    ].join("\0") + "\0").pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "PATH",
            version: "VERSION",
        },
        "/cwd",
        "relative"
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            "packages/git/src/api/status/tracked.test.ts",
            "packages/git/src/api/status/untracked.test.ts",
        ]);
    }
});
