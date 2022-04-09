import test from "ava";
import NAC from "node-abort-controller";
import { ERROR_CANCELLED, ERROR_GENERIC, ERROR_TIMEOUT } from "../errors.js";
import { isErr, isOk, unwrap } from "../func-result.js";
import { create } from "./create.js";
import { createSpawn } from "./create.stub.js";

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

test("Aborted before", async t => {
    const spawn = createSpawn("exit");
    const cli = create(
        "/git",
        { env: {}, timeout: 250 },
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

test("Aborted during", async t => {
    const spawn = createSpawn("exit", { delay: 250 });
    const cli = create(
        "/git",
        { env: {}, timeout: 250 },
        { child_process: { spawn }, process: { env: {} } },
    );
    // TODO This could be better validated by checking what the value of `aborted` was when accessed
    const abortController = new NAC.AbortController();
    const pendingRes = cli({ cwd: "/", signal: abortController.signal }, ["foobar"]);
    const pendingAbort = new Promise<void>(resolve => {
        setTimeout(() => {
            abortController.abort();
            resolve();
        }, 5);
    });
    const [res] = await Promise.all([pendingRes, pendingAbort]);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_CANCELLED);
    }
});

test.todo("Non-zero exit");
test.todo("stderr");
test.todo("stdout");
