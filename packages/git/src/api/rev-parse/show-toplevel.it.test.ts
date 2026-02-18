import test from "node:test";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { tempGitRepo, gitCtx, services } from "../helpers.it.stub.js";
import { showToplevel } from "./show-toplevel.js";

test(showToplevel.name, async () => {
    await using repo = await tempGitRepo();
    const result = await showToplevel(gitCtx, repo.path, services);
    if (isErr(result)) {
        throw unwrap(result);
    }
    const topLevelPath = unwrap(result);
    assert.strictEqual(topLevelPath, repo.path);
});
