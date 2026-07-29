import assert from "node:assert";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { gitDir } from "./git-dir.js";

test(gitDir.name, async () => {
    await using repo = await tempGitRepo();
    const gitDirPath = unwrapOk(await gitDir(gitCtx, repo.path));
    assert.strictEqual(gitDirPath, path.join(repo.path, ".git"));
});
