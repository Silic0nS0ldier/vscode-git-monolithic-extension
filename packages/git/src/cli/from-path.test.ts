// @ts-expect-error
import test from "ava";
import { ERROR_GIT_NOT_FOUND } from "../errors.js";
import { isErr, isOk, unwrap } from "../func-result.js";
import { createSpawn } from "./create.stub.js";
import { fromPath } from "./from-path.js";

// @ts-ignore
test("Basic case", async t => {
    const spawn = createSpawn("exit", { out: "git version 2.34.1.vfs.0.0\n" });
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { fs: { exists: () => true }, child_process: { spawn }, process: { env: {} }, os: { platform: "TEST" } },
    );
    t.true(isOk(res));
    if (isOk(res)) {
        const context = unwrap(res);
        t.is(context.version, "2.34.1.vfs.0.0");
    }
});

// @ts-ignore
test.only("No git", async t => {
    const spawn = createSpawn("error");
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { fs: { exists: () => true }, child_process: { spawn }, process: { env: {} }, os: { platform: "TEST" } },
    );
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GIT_NOT_FOUND);
    }
});
