import test from "ava";
import { ERROR_GIT_UNUSABLE } from "../errors.js";
import { isErr, isOk, unwrap } from "../func-result.js";
import { createSpawn } from "./create.stub.js";
import { fromPath } from "./from-path.js";

test("Basic case", async t => {
    const spawn = createSpawn("exit", { out: "git version 2.34.1.vfs.0.0\n" });
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, fs: { exists: () => true }, os: { platform: "TEST" }, process: { env: {} } },
    );
    t.true(isOk(res));
    if (isOk(res)) {
        const context = unwrap(res);
        t.is(context.version, "2.34.1.vfs.0.0");
    }
});

test("Unusable due to version check failure", async t => {
    const spawn = createSpawn("error");
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { child_process: { spawn }, fs: { exists: () => true }, os: { platform: "TEST" }, process: { env: {} } },
    );
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GIT_UNUSABLE);
    }
});
