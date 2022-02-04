// @ts-expect-error
import test from "ava";
import { isErr, isOk, unwrap } from "../func-result.js";
import { fromPath } from "./from-path.js";
import { createSpawn } from "./create.stub.js";

// @ts-ignore
test("Basic case", async t => {
    const spawn = createSpawn("exit", { out: "git version 2.34.1.vfs.0.0\n" });
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { fs: { exists: () => true }, child_process: { spawn }, process: { env: {} } },
    );
    t.true(isOk(res));
    if (isOk(res)) {
        const context = unwrap(res);
        t.is(context.version, "2.34.1.vfs.0.0");
    }
});

// @ts-ignore
test.skip("No git", async t => {
    const spawn = createSpawn("error");
    const res = await fromPath(
        "/git",
        { env: {}, timeout: 1000 },
        { fs: { exists: () => true }, child_process: { spawn }, process: { env: {} } },
    );
    t.true(isErr(res));
    if (isErr(res)) {
        t.log(unwrap(res));
    }
});
