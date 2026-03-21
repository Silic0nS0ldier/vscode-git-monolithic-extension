import test from "node:test"
import path from "node:path";
import assert from "node:assert";
import { gitDir } from "./git-dir.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { unwrapOk } from "../../errors.js";

test(gitDir.name, async () => {
    await using repo = await tempGitRepo();
    const gitDirPath = unwrapOk(await gitDir(gitCtx, repo.path));
    assert.strictEqual(gitDirPath, path.join(repo.path, ".git"));
});
