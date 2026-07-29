import assert from "node:assert";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, services, tempGitRepo } from "../helpers.it.stub.js";
import { showToplevel } from "./show-toplevel.js";

test(showToplevel.name, async () => {
    await using repo = await tempGitRepo();
    const topLevelPath = unwrapOk(await showToplevel(gitCtx, repo.path, services));
    assert.strictEqual(topLevelPath, repo.path);
});
