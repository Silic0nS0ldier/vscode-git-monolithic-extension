import assert from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { remoteHead } from "./remote-head.js";

test(remoteHead.name + " - resolves the default branch of a cloned remote", async () => {
    await using source = await tempGitRepo(true);
    await run(source.path, ["branch", "-M", "trunk"]);
    const clone = `${source.path}-clone`;

    try {
        await run(source.path, ["clone", source.path, clone]);

        assert.strictEqual(unwrapOk(await remoteHead(gitCtx, clone, "origin")), "refs/heads/trunk");
    } finally {
        await fs.rm(clone, { force: true, recursive: true });
    }
});

test(remoteHead.name + " - reports nothing for a remote that was added rather than cloned", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["remote", "add", "origin", repo.path]);

    assert.strictEqual(unwrapOk(await remoteHead(gitCtx, repo.path, "origin")), undefined);
});

test(remoteHead.name + " - reports nothing for a remote that does not exist", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await remoteHead(gitCtx, repo.path, "absent")), undefined);
});
