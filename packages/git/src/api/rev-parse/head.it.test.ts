import assert from "node:assert";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { head } from "./head.js";

test(head.name, async () => {
    await using repo = await tempGitRepo(true);

    const headHash = unwrapOk(await head(gitCtx, repo.path));
    assert.strictEqual(headHash?.length, 40, "Expected head hash to be 40 characters long");
});

test(head.name + " preserves failures and supports cancellation", async () => {
    await using repo = await tempGitRepo();
    assert.ok(isErr(await head(gitCtx, repo.path)), "an unborn HEAD remains an error");
    assert.ok(isErr(await head(gitCtx, repo.path, AbortSignal.abort())));
});
