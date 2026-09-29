import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { trySemverCheck, version } from "./mod.js";

test("Basic case", async t => {
    const res = await version({
        cli: async (context) => {
            if (context.stdout) {
                intoStream("git version foobar").pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "",
        version: "PENDING",
    });
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "foobar");
    }
});

const semverCheckMacro = test.macro({
    exec(t, gitVersion: string, range: string, expected: boolean) {
        t.is(trySemverCheck(gitVersion, range), expected);
    },
    title(_, gitVersion, range, expected) {
        return `Version check of "${gitVersion}" against "${range}" is ${expected}`;
    },
});

test(semverCheckMacro, "2.11.0", "2.11.0", true);
test(semverCheckMacro, "2.10.5", "2.11.0", false);
test(semverCheckMacro, "2.25.1", ">=2.25", true);
test(semverCheckMacro, "2.34.1.vfs.0.0", "2.11.0", true);
test(semverCheckMacro, "2.45.1.windows.1", "2.11.0", true);
test(semverCheckMacro, "2.39.3 (Apple Git-146)", "2.11.0", true);
test(semverCheckMacro, "2.55.0.0.vendor-git.commithash", "2.11.0", true);
test(semverCheckMacro, "2.55.0.0.vendor-git.commithash", "2.56.0", false);
