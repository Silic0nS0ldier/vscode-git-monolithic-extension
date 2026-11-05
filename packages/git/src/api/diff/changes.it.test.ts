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
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, empty, root)), [{ status: "A", path: oldPath }]);
    await run(repo.path, ["mv", oldPath, newPath]);
    await run(repo.path, ["commit", "-m", "Rename"]);
    const renamed = await read(repo.path, ["rev-parse", "HEAD"]);
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, root, renamed)), [
        { status: "R", originalPath: oldPath, path: newPath },
    ]);
    await run(repo.path, ["rm", "--", newPath]);
    await run(repo.path, ["commit", "-m", "Delete"]);
    assert.deepEqual(unwrapOk(await changes(gitCtx, repo.path, renamed, "HEAD")), [{ status: "D", path: newPath }]);
    assert.ok(isErr(await changes(gitCtx, repo.path, "invalid", "HEAD")));
});
