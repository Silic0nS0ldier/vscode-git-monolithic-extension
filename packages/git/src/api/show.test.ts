import test from "ava";
import intoStream from "into-stream";
import { isOk, ok, unwrap } from "../func-result.js";
import { show } from "./show.js";

test("Basic case", async t => {
    const res = await show(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream("content").pipe(context.stdout);
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
        t.is(unwrap(res).toString("utf-8"), "content");
    }
});
