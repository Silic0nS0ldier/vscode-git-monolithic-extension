import test from "ava";
import path from "node:path";
import { isErr, unwrap } from "../../func-result.js";
import { gitDir } from "./git-dir.js";
import { inspect } from "node:util";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";

test(gitDir.name, async t => {
    await using repo = await tempGitRepo();
    const result = await gitDir(gitCtx, repo.path);
    if (isErr(result)) {
        t.fail(`Expected gitDir to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const gitDirPath = unwrap(result);
    t.is(gitDirPath, path.join(repo.path, ".git"));
});
