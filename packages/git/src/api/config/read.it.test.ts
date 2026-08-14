import assert from "node:assert";
import test from "node:test";
import { ERROR_GENERIC, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { readEffective } from "./read.js";

test(readEffective.name + " - reads a locally set key", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["config", "commit.template", ".gitmessage"]);

    assert.strictEqual(unwrapOk(await readEffective(gitCtx, repo.path, "commit.template")), ".gitmessage");
});

test(readEffective.name + " - resolves to undefined when unset", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await readEffective(gitCtx, repo.path, "commit.template")), undefined);
});

test(readEffective.name + " - fails for a key missing its section", async () => {
    await using repo = await tempGitRepo(true);

    const result = await readEffective(gitCtx, repo.path, "notasectionkey");
    assert.ok(isErr(result), "expected a section-less key to be rejected");
    if (isErr(result)) {
        assert.strictEqual(unwrap(result).type, ERROR_GENERIC);
    }
});
