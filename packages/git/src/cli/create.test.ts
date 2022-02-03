// @ts-expect-error
import test from "ava";
import NAC from "node-abort-controller";
import { ERROR_CANCELLED, ERROR_GENERIC, ERROR_TIMEOUT } from "../errors.js";
import { isErr, isOk, unwrap } from "../func-result.js";
import { create } from "./create.js";
import { createSpawn } from "./create.stub.js";

// @ts-ignore
test("Basic case", async t => {
    const spawn = createSpawn("exit");
    const cli = create(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["foobar"]);
    t.true(isOk(res));
});

// @ts-ignore
test("Timeout", async t => {
    const spawn = createSpawn("exit", { delay: 250 });
    const cli = create(
        "/git",
        { env: {}, timeout: 1 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["foobar"]);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_TIMEOUT);
    }
});

// @ts-ignore
test("Child process error", async t => {
    const spawn = createSpawn("error");
    const cli = create(
        "/git",
        { env: {}, timeout: 1 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["foobar"]);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});

// @ts-ignore
test("Aborted before", async t => {
    const spawn = createSpawn("exit");
    const cli = create(
        "/git",
        { env: {}, timeout: 1 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const abortController = new NAC.AbortController();
    abortController.abort();
    const res = await cli({ cwd: "/", signal: abortController.signal }, ["foobar"]);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_CANCELLED);
    }
});

test.todo("Aborted during");
test.todo("Non-zero exit");
test.todo("stderr");
test.todo("stdout");
