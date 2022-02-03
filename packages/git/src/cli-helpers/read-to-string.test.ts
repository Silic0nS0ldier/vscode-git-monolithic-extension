// @ts-expect-error
import test from "ava";
import intoStream from "into-stream";
import { ERROR_BUFFER_OVERFLOW, ERROR_GENERIC } from "../errors.js";
import { err, isErr, isOk, ok, unwrap } from "../func-result.js";
import { readToString } from "./read-to-string.js";

// @ts-ignore
test("Basic case", async t => {
    const res = await readToString({
        cli: async (context) => {
            if (context.stdout) {
                intoStream("foobar").pipe(context.stdout);
            }
            return ok(void 0);
        },
        cwd: "/",
    }, []);
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "foobar");
    }
});

// @ts-ignore
test("Buffer overflow", async t => {
    const res = await readToString({
        cli: async (context) => {
            if (context.stdout) {
                intoStream("a".repeat(1025)).pipe(context.stdout);
            }
            return ok(void 0);
        },
        cwd: "/",
    }, []);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_BUFFER_OVERFLOW);
    }
});

// @ts-ignore
test("Generic error", async t => {
    const res = await readToString({
        cli: async (context) => {
            if (context.stdout) {
                intoStream("foobar").pipe(context.stdout);
            }
            return err({ type: ERROR_GENERIC });
        },
        cwd: "/",
    }, []);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});
