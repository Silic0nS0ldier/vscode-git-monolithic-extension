import test from "node:test";
import assert from "node:assert";
import { tempGitRepo, gitCtx, services } from "../helpers.it.stub.js";
import { showToplevel } from "./show-toplevel.js";
import { unwrapOk } from "../../errors.js";

test(showToplevel.name, async () => {
    await using repo = await tempGitRepo();
    const topLevelPath = unwrapOk(await showToplevel(gitCtx, repo.path, services));
    assert.strictEqual(topLevelPath, repo.path);
});
