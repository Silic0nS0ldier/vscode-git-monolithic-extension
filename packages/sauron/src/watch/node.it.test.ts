import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { type AbsolutePath, absolutePath, gitignore, watch, type Watcher, type WatchEvent } from "../mod.js";

let root: AbsolutePath;
let watcher: Watcher;

function abs(...segments: string[]): AbsolutePath {
    const result = absolutePath(path.join(root, ...segments));
    assert.ok(!isErr(result));
    return unwrap(result);
}

/** Reads until `changes` batches cover every target, returning everything reported. */
async function changesCovering(...targets: AbsolutePath[]): Promise<Set<AbsolutePath>> {
    const seen = new Set<AbsolutePath>();
    const covered = (target: AbsolutePath) =>
        seen.has(target) || seen.values().some(dir => target.startsWith(dir + "/"));
    while (!targets.every(covered)) {
        const result = await watcher.next();
        assert.equal(result.done, false, "watcher closed early");
        const event: WatchEvent = result.value;
        if (event.type === "changes") {
            for (const changed of event.paths.union(event.subtrees)) {
                seen.add(changed);
            }
        }
    }
    return seen;
}

before(async () => {
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "sauron-")));
    const parsed = absolutePath(tmp);
    assert.ok(!isErr(parsed));
    root = unwrap(parsed);
    await fs.mkdir(path.join(root, "src"));
    await fs.mkdir(path.join(root, "build"));
    await fs.writeFile(path.join(root, ".gitignore"), "build/\n*.log\n");

    const created = watch({ roots: [root], ignore: gitignore(), settle: { quiet: 50, maxWait: 2_000 } });
    assert.ok(!isErr(created));
    watcher = unwrap(created);
    for (;;) {
        const result = await watcher.next();
        assert.equal(result.done, false);
        if (result.value.type === "crawl" && result.value.done) {
            break;
        }
    }
});

after(async () => {
    await watcher[Symbol.asyncDispose]();
    await fs.rm(root, { recursive: true, force: true });
});

test("a file write is reported", async () => {
    await fs.writeFile(path.join(root, "src", "a.ts"), "export {};\n");
    await changesCovering(abs("src", "a.ts"));
});

test("files in a new directory are covered once it is created", async () => {
    await fs.mkdir(path.join(root, "src", "nested"));
    await fs.writeFile(path.join(root, "src", "nested", "b.ts"), "");
    await changesCovering(abs("src", "nested", "b.ts"));
    // The new directory is now watched directly.
    await fs.writeFile(path.join(root, "src", "nested", "c.ts"), "");
    await changesCovering(abs("src", "nested", "c.ts"));
});

test("ignored paths are not reported", async () => {
    await fs.writeFile(path.join(root, "build", "out.js"), "");
    await fs.writeFile(path.join(root, "src", "debug.log"), "");
    await fs.writeFile(path.join(root, "src", "marker.ts"), "");
    const seen = await changesCovering(abs("src", "marker.ts"));
    assert.ok(!seen.has(abs("build", "out.js")));
    assert.ok(!seen.has(abs("src", "debug.log")));
});

test("suspension releases changes in one batch", async () => {
    {
        await using _suspended = watcher.suspend("bulk write");
        for (let i = 0; i < 20; i++) {
            await fs.writeFile(path.join(root, "src", `bulk-${i}.ts`), "");
        }
    }
    await changesCovering(...Array.from({ length: 20 }, (_, i) => abs("src", `bulk-${i}.ts`)));
});
