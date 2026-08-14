import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { cherry } from "./cherry.js";

/** A bare repository to push at, so upstream tracking is set up the way git does it. */
async function tempBareRepo() {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test-remote"));
    await run(repoPath, ["init", "--bare", "--initial-branch=main", "."]);

    return {
        path: repoPath,
        async [Symbol.asyncDispose]() {
            await fs.rm(repoPath, { force: true, recursive: true });
        },
    };
}

async function commit(repo: string, content: string, message: string): Promise<void> {
    await fs.writeFile(path.join(repo, "file.txt"), content);
    await run(repo, ["add", "."]);
    await run(repo, ["commit", "-m", message]);
}

test(cherry.name + " - marks a rebased-and-repushed commit as equivalent", async () => {
    await using remote = await tempBareRepo();
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "base", "Base");
    await run(repo.path, ["remote", "add", "origin", remote.path]);
    await run(repo.path, ["push", "--set-upstream", "origin", "main"]);

    await commit(repo.path, "local", "Local pending change");

    // Same tree as the local-only commit, off the same base, the way a rebase would produce.
    const equivalent = await read(repo.path, ["commit-tree", "HEAD^{tree}", "-p", "HEAD^", "-m", "Equivalent change"]);
    await run(repo.path, ["push", "origin", `${equivalent}:refs/heads/main`]);
    await run(repo.path, ["fetch", "origin"]);

    const entries = unwrapOk(await cherry(gitCtx, repo.path, "main...main@{upstream}"));

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, "equivalent");
    assert.strictEqual(entries[0].hash, equivalent.slice(0, entries[0].hash.length));
});

test(cherry.name + " - marks a commit with no equivalent as unique", async () => {
    await using remote = await tempBareRepo();
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "base", "Base");
    await run(repo.path, ["remote", "add", "origin", remote.path]);
    await run(repo.path, ["push", "--set-upstream", "origin", "main"]);

    // Pushed straight from local, so it has no local-only counterpart to be equivalent to.
    await commit(repo.path, "upstream-only", "Upstream-only change");
    await run(repo.path, ["push", "origin", "main"]);
    await run(repo.path, ["reset", "--hard", "HEAD~1"]);
    await run(repo.path, ["fetch", "origin"]);

    const entries = unwrapOk(await cherry(gitCtx, repo.path, "main...main@{upstream}"));

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, "unique");
});

test(cherry.name + " - yields nothing when nothing diverges", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);
    await commit(repo.path, "base", "Base");

    assert.deepStrictEqual(unwrapOk(await cherry(gitCtx, repo.path, "main...main")), []);
});

test(cherry.name + " - fails when the range has no upstream", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);
    await commit(repo.path, "base", "Base");

    assert.ok(isErr(await cherry(gitCtx, repo.path, "main...main@{upstream}")));
});
