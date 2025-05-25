import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { tracked } from "./tracked.js";

test("Basic case", async t => {
    const res = await tracked(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream([
                        "M  extension/src/git.ts",
                        "D  extension/src/git/IFileStatus.ts",
                        "MM extension/src/repository/repository-class/mod.ts",
                        "M  extension/src/repository/repository-class/update-model-state.ts",
                        " M extension/src/util/config.ts",
                        "A  packages/git/src/api/status/tracked.ts",

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
            {
                path: 'extension/src/git.ts',
                rename: undefined,
                x: 'M',
                y: ' ',
            },
            {
                path: 'extension/src/git/IFileStatus.ts',
                rename: undefined,
                x: 'D',
                y: ' ',
            },
            {
                path: 'extension/src/repository/repository-class/mod.ts',
                rename: undefined,
                x: 'M',
                y: 'M',
            },
            {
                path: 'extension/src/repository/repository-class/update-model-state.ts',
                rename: undefined,
                x: 'M',
                y: ' ',
            },
            {
                path: 'extension/src/util/config.ts',
                rename: undefined,
                x: ' ',
                y: 'M',
            },
            {
                path: 'packages/git/src/api/status/tracked.ts',
                rename: undefined,
                x: 'A',
                y: ' ',
            },
        ]);
    }
});
