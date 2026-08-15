import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { showCdup } from "./show-cdup.js";

test(showCdup.name + " - reports an empty path at the top of a work tree", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await showCdup(gitCtx, repo.path)), "");
});

test(showCdup.name + " - reports the path back up to the top of a work tree", async () => {
    await using repo = await tempGitRepo(true);
    const nested = path.join(repo.path, "a", "b");
    await fs.mkdir(nested, { recursive: true });

    assert.strictEqual(unwrapOk(await showCdup(gitCtx, nested)), "../../");
});

test(showCdup.name + " - reports an empty path in a bare repository", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    try {
        const bare = path.join(parent, "bare.git");
        await run(parent, ["init", "--bare", bare]);

        // Indistinguishable from the top of a work tree, which is why the extension pairs
        // this with a check for a HEAD file in the directory.
        assert.strictEqual(unwrapOk(await showCdup(gitCtx, bare)), "");
    } finally {
        await fs.rm(parent, { force: true, recursive: true });
    }
});

test(showCdup.name + " - fails outside a repository", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    try {
        const result = await showCdup(gitCtx, outside);

        assert.ok(isErr(result));
        const error = unwrap(result);
        assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    } finally {
        await fs.rm(outside, { force: true, recursive: true });
    }
});
