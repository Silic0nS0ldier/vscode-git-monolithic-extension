import test from "ava";
import {
    ERROR_CANCELLED,
    ERROR_GENERIC,
    ERROR_NON_ZERO_EXIT,
    ERROR_TIMEOUT,
    type NonZeroExitDetails,
} from "../errors.js";
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
    const abortController = new AbortController();
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
    const abortController = new AbortController();
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

test("Non-zero exit", async t => {
    const spawn = createSpawn("exit", { code: 128, err: "fatal: not a git repository\n", out: "stdout\n" });
    const cli = create(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/somewhere" }, ["status"]);
    t.true(isErr(res));
    if (isErr(res)) {
        const error = unwrap(res);
        t.is(error.type, ERROR_NON_ZERO_EXIT);
        t.deepEqual(error.cause, {
            args: ["status"],
            cwd: "/somewhere",
            executablePath: "/git",
            exitCode: 128,
            signal: "SIGQUIT",
            stderr: "fatal: not a git repository\n",
            stdout: "stdout\n",
        });
    }
});

test("Non-zero exit retains the tail of oversized output", async t => {
    // The captured tail is capped at 64 KiB; only the end of a larger stream survives.
    const tail = "the end\n";
    const err = "x".repeat(64 * 1024) + tail;
    const spawn = createSpawn("exit", { code: 1, err });
    const cli = create(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["merge"]);
    t.true(isErr(res));
    if (isErr(res)) {
        const { stderr } = unwrap(res).cause as NonZeroExitDetails;
        t.is(stderr.length, 64 * 1024);
        t.true(stderr.endsWith(tail));
    }
});

test("Output is consumed even when the caller ignores it", async t => {
    // An unread pipe stalls the child once its buffer fills, so the CLI always drains it.
    const spawn = createSpawn("exit", { out: "x".repeat(1024 * 1024) });
    const cli = create(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["log"]);
    t.true(isOk(res));
});
