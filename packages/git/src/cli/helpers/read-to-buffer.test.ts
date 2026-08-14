import test from "ava";
import intoStream from "into-stream";
import { createNonZeroExitError, ERROR_BUFFER_OVERFLOW, ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { err, isErr, isOk, ok, unwrap } from "../../func-result.js";
import { readToBuffer } from "./read-to-buffer.js";

test("Reads output into a buffer", async t => {
    const res = await readToBuffer(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream("content").pipe(context.stdout);
                }
                return ok(void 0);
            },
            cwd: "/",
        },
        [],
        1024,
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res).toString("utf-8"), "content");
    }
});

test("Reports a buffer overflow", async t => {
    const res = await readToBuffer(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream("a".repeat(1025)).pipe(context.stdout);
                }
                return ok(void 0);
            },
            cwd: "/",
        },
        [],
        1024,
    );
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_BUFFER_OVERFLOW);
    }
});

test("Preserves the CLI's own error type rather than wrapping it as generic", async t => {
    const details = {
        args: [],
        cwd: "/",
        executablePath: "git",
        exitCode: 1,
        signal: null,
        stderr: "",
        stdout: "",
    };

    const res = await readToBuffer(
        {
            cli: async (context) => {
                context.stdout?.end();
                return err(createNonZeroExitError(details));
            },
            cwd: "/",
        },
        [],
        1024,
    );

    t.true(isErr(res));
    if (isErr(res)) {
        const error = unwrap(res);
        t.is(error.type, ERROR_NON_ZERO_EXIT);
        t.deepEqual(error.cause, details);
    }
});
