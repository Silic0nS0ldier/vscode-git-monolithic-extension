import test from "node:test";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { head } from "./head.js";

test.skip(head.name, async () => {
    await using repo = await tempGitRepo(true);

    const result = await head(gitCtx, repo.path);
    if (isErr(result)) {
        throw unwrap(result);
    }
    const headHash = unwrap(result);
    assert.strictEqual(headHash?.length, 40, "Expected head hash to be 40 characters long");
});
