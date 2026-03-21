import test from "node:test";
import assert from "node:assert";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { head } from "./head.js";
import { unwrapOk } from "../../errors.js";

test.skip(head.name, async () => {
    await using repo = await tempGitRepo(true);

    const headHash = unwrapOk(await head(gitCtx, repo.path));
    assert.strictEqual(headHash?.length, 40, "Expected head hash to be 40 characters long");
});
