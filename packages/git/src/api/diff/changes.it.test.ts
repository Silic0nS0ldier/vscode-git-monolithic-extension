import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { emptyTree } from "../hash-object/empty-tree.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { changes } from "./changes.js";

test("changes - compares root commits, renames and deletions with unquoted paths", async () => {
    await using repo = await tempGitRepo();
    const oldPath = "old\tfile.txt";
    const newPath = "new\nfile.txt";
    await fs.writeFile(path.join(repo.path, oldPath), "content\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Root"]);
    const root = await read(repo.path, ["rev-parse", "HEAD"]);
    const empty = unwrapOk(await emptyTree(gitCtx, repo.path));
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, empty, root)), [
        { status: "A", path: oldPath, originalMode: "000000", mode: "100644" },
    ]);
    await run(repo.path, ["mv", oldPath, newPath]);
    await run(repo.path, ["commit", "-m", "Rename"]);
    const renamed = await read(repo.path, ["rev-parse", "HEAD"]);
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, root, renamed)), [
        { status: "R", originalPath: oldPath, path: newPath, originalMode: "100644", mode: "100644" },
    ]);
    await run(repo.path, ["rm", "--", newPath]);
    await run(repo.path, ["commit", "-m", "Delete"]);
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, renamed, "HEAD")), [
        { status: "D", path: newPath, originalMode: "100644", mode: "000000" },
    ]);
    assert.ok(isErr(await changes(gitCtx, repo.path, "invalid", "HEAD")));
});

test("changes - reports submodule modes", async () => {
    await using repo = await tempGitRepo(true);
    const before = await read(repo.path, ["rev-parse", "HEAD"]);
    await run(repo.path, ["update-index", "--add", "--cacheinfo", `160000,${before},sub`]);
    await run(repo.path, ["commit", "-m", "Add submodule"]);
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, before, "HEAD")), [
        { status: "A", path: "sub", originalMode: "000000", mode: "160000" },
    ]);
});
