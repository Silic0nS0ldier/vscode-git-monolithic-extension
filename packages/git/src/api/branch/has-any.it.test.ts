import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { hasAny } from "./has-any.js";

test(hasAny.name + " - reports no branches before the first commit", async () => {
    await using repo = await tempGitRepo();

    assert.strictEqual(unwrapOk(await hasAny(gitCtx, repo.path)), false);
});

test(hasAny.name + " - reports branches once there is a commit", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await hasAny(gitCtx, repo.path)), true);
});

test(hasAny.name + " - reports no branches once the only branch is deleted", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["update-ref", "-d", "HEAD"]);

    assert.strictEqual(unwrapOk(await hasAny(gitCtx, repo.path)), false);
});

test(hasAny.name + " - counts a detached HEAD even when no branch is left", async () => {
    await using repo = await tempGitRepo(true);
    const branch = (await fs.readFile(path.join(repo.path, ".git", "HEAD"), "utf8")).trim().replace(/^ref: /u, "");
    await run(repo.path, ["checkout", "--detach"]);
    await run(repo.path, ["update-ref", "-d", branch]);

    assert.strictEqual(unwrapOk(await hasAny(gitCtx, repo.path)), true);
});

test(hasAny.name + " - fails outside a repository", async () => {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    await using _dir = { [Symbol.asyncDispose]: () => fs.rm(dirPath, { force: true, recursive: true }) };

    const result = await hasAny(gitCtx, dirPath);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /not a git repository/u);
    }
});
