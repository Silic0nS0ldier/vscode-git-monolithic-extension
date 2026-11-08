import test from "ava";
import intoStream from "into-stream";
import { PassThrough, Readable, Writable } from "node:stream";
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
    const kills: unknown[] = [];
    const spawn = createSpawn("exit", { onKill: signal => kills.push(signal) });
    const cli = create(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, process: { env: {} } },
    );
    const res = await cli({ cwd: "/" }, ["foobar"]);
    t.true(isOk(res));
    t.deepEqual(kills, [], "a process that exits on its own is left alone");
});

test("Supplied stdin is piped to the process and closed", async t => {
    const stdin = new PassThrough();
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    const cli = create("/git", { env: {}, timeout: 1000 }, {
        child_process: { spawn: createSpawn("exit", { stdin, delay: 10 }) },
        process: { env: {} },
    });
    t.true(isOk(await cli({ cwd: "/", stdin: intoStream(["pay", "load"]) }, ["hash-object", "--stdin"])));
    t.true(stdin.writableEnded);
    t.is(Buffer.concat(chunks).toString(), "payload");
});

test("Failures reading the supplied stdin stop the process and return an error", async t => {
    const kills: unknown[] = [];
    const stdin = new PassThrough();
    const cli = create("/git", { env: {}, timeout: 1000 }, {
        child_process: { spawn: createSpawn("exit", { stdin, delay: 10, onKill: signal => kills.push(signal) }) },
        process: { env: {} },
    });
    const source = new Readable({
        read(): void {
            this.destroy(new Error("Cannot read source"));
        },
    });
    const result = await cli({ cwd: "/", stdin: source }, ["hash-object", "--stdin"]);
    t.true(isErr(result));
    if (isErr(result)) t.is(unwrap(result).type, ERROR_GENERIC);
    t.deepEqual(kills, [undefined]);
    t.true(stdin.destroyed);
});

test("Failures writing to the process's stdin stop the process and return an error", async t => {
    const kills: unknown[] = [];
    const stdin = new Writable({
        write(_chunk, _encoding, callback): void {
            callback(new Error("Broken pipe"));
        },
    });
    const cli = create("/git", { env: {}, timeout: 1000 }, {
        child_process: { spawn: createSpawn("exit", { stdin, delay: 10, onKill: signal => kills.push(signal) }) },
        process: { env: {} },
    });
    const source = intoStream("payload");
    const result = await cli({ cwd: "/", stdin: source }, ["hash-object", "--stdin"]);
    t.true(isErr(result));
    if (isErr(result)) t.is(unwrap(result).type, ERROR_GENERIC);
    t.deepEqual(kills, [undefined]);
    t.true(source.destroyed);
});

test("Timeout", async t => {
    const kills: unknown[] = [];
    const spawn = createSpawn("exit", { delay: 250, onKill: signal => kills.push(signal) });
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
    // Killed with the default signal, SIGTERM.
    t.deepEqual(kills, [undefined]);
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
    const kills: unknown[] = [];
    const spawn = createSpawn("exit", { delay: 250, onKill: signal => kills.push(signal) });
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
    t.deepEqual(kills, [undefined]);
});

test("Aborted during", async t => {
    const kills: unknown[] = [];
    const spawn = createSpawn("exit", { delay: 250, onKill: signal => kills.push(signal) });
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
    t.deepEqual(kills, [undefined]);
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
