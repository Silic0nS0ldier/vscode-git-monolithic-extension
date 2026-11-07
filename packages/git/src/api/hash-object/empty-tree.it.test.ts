import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { emptyTree } from "./empty-tree.js";

test("emptyTree - works before a repository has any commits", async () => {
    await using repo = await tempGitRepo();
    assert.equal(unwrapOk(await emptyTree(gitCtx, repo.path)), "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
});

test("emptyTree - respects SHA-256 repositories", async () => {
    await using repo = await tempGitRepo();
    const nested = path.join(repo.path, "sha256");
    await fs.mkdir(nested);
    await run(nested, ["init", "--object-format=sha256"]);
    assert.equal(unwrapOk(await emptyTree(gitCtx, nested)), createHash("sha256").update("tree 0\0").digest("hex"));
});
