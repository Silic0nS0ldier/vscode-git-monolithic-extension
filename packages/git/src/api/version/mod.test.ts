import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../../func-result.js";
import { version } from "./mod.js";

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
