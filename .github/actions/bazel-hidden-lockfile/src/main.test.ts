import test from "ava";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../main.mjs", import.meta.url));

test("the launcher runs the TypeScript post hook without compiled output", (t) => {
    const child = spawnSync(process.execPath, [launcher], {
        env: {
            ...process.env,
            "STATE_is-post": "true",
            INPUT_SAVE: "false",
        },
        encoding: "utf8",
    });

    t.is(child.error, undefined);
    t.is(child.status, 0, child.stderr);
});

test("the launcher propagates a TypeScript action failure", (t) => {
    const child = spawnSync(process.execPath, [launcher], {
        env: {
            ...process.env,
            "STATE_is-post": "true",
            INPUT_SAVE: "invalid",
        },
        encoding: "utf8",
    });

    t.is(child.error, undefined);
    t.is(child.status, 1, child.stderr);
    t.true(child.stdout.includes("Input does not meet YAML 1.2"), child.stdout);
});
