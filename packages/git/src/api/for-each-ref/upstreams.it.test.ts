import assert from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { upstreams } from "./upstreams.js";

/** A work tree whose `origin` is a bare repository it has pushed `main` and `topic` to. */
async function repoWithOrigin() {
    const repo = await tempGitRepo(true);
    const origin = `${repo.path}-origin.git`;

    try {
        await run(repo.path, ["branch", "-M", "main"]);
        await run(repo.path, ["init", "--bare", "--initial-branch=main", origin]);
        await run(repo.path, ["remote", "add", "origin", origin]);
        await run(repo.path, ["push", "--set-upstream", "origin", "main"]);
        await run(repo.path, ["push", "origin", "main:topic"]);

        return {
            origin,
            path: repo.path,
            async [Symbol.asyncDispose]() {
                await fs.rm(origin, { force: true, recursive: true });
                await repo[Symbol.asyncDispose]();
            },
        };
    } catch (error) {
        await fs.rm(origin, { force: true, recursive: true });
        await repo[Symbol.asyncDispose]();
        throw error;
    }
}

test(upstreams.name + " - lists branches tracking a remote, by the remote's name for the ref", async () => {
    await using repo = await repoWithOrigin();
    await run(repo.path, ["branch", "--track", "local-topic", "origin/topic"]);
    await run(repo.path, ["branch", "loose"]);
    await run(repo.path, ["branch", "--track", "stacked", "main"]);

    const result = unwrapOk(await upstreams(gitCtx, repo.path));

    assert.deepStrictEqual(result, [
        { branch: "local-topic", gone: false, ref: "refs/heads/topic", remote: "origin" },
        { branch: "main", gone: false, ref: "refs/heads/main", remote: "origin" },
    ]);
});

test(upstreams.name + " - flags a branch whose tracking ref was pruned", async () => {
    await using repo = await repoWithOrigin();
    await run(repo.path, ["branch", "--track", "local-topic", "origin/topic"]);
    await run(repo.origin, ["update-ref", "-d", "refs/heads/topic"]);
    await run(repo.path, ["fetch", "--prune", "origin"]);

    const result = unwrapOk(await upstreams(gitCtx, repo.path, ["refs/heads/local-topic"]));

    assert.deepStrictEqual(result, [
        { branch: "local-topic", gone: true, ref: "refs/heads/topic", remote: "origin" },
    ]);
});
