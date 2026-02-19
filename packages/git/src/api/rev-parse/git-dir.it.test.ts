import test from "node:test"
import path from "node:path";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { gitDir } from "./git-dir.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";

test(gitDir.name, async () => {
    await using repo = await tempGitRepo();
    const result = await gitDir(gitCtx, repo.path);
    if (isErr(result)) {
        throw unwrap(result);
    }
    const gitDirPath = unwrap(result);
    assert.strictEqual(gitDirPath, path.join(repo.path, ".git"));
});
