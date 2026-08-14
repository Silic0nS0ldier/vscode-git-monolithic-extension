import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { branch } from "./branch.js";

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

async function commit(repo: string, message: string): Promise<string> {
    await fs.writeFile(path.join(repo, "file.txt"), message);
    await run(repo, ["add", "."]);
    await run(repo, ["commit", "-m", message]);
    return await read(repo, ["rev-parse", "HEAD"]);
}

test(branch.name + " - resolves a branch by its short name", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);
    const head = await commit(repo.path, "Base");

    const detail = unwrapOk(await branch(gitCtx, repo.path, "main"));

    assert.deepStrictEqual(detail, {
        ahead: 0,
        behind: 0,
        commit: head,
        kind: "head",
        name: "main",
        upstream: undefined,
    });
});

test(branch.name + " - reports the upstream and how far it has diverged", async () => {
    await using remote = await tempBareRepo();
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "Base");
    await run(repo.path, ["remote", "add", "origin", remote.path]);
    await run(repo.path, ["push", "--set-upstream", "origin", "main"]);

    const ahead = await commit(repo.path, "Ahead");

    assert.deepStrictEqual(unwrapOk(await branch(gitCtx, repo.path, "main")), {
        ahead: 1,
        behind: 0,
        commit: ahead,
        kind: "head",
        name: "main",
        upstream: { name: "main", remote: "origin" },
    });

    // Rewinding to before the pushed tip leaves the branch behind instead.
    await run(repo.path, ["reset", "--hard", "origin/main~1"]);

    assert.deepStrictEqual(unwrapOk(await branch(gitCtx, repo.path, "main")), {
        ahead: 0,
        behind: 1,
        commit: await read(repo.path, ["rev-parse", "HEAD"]),
        kind: "head",
        name: "main",
        upstream: { name: "main", remote: "origin" },
    });
});

test(branch.name + " - resolves a fully qualified remote ref", async () => {
    await using remote = await tempBareRepo();
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    const head = await commit(repo.path, "Base");
    await run(repo.path, ["remote", "add", "origin", remote.path]);
    await run(repo.path, ["push", "--set-upstream", "origin", "main"]);

    const detail = unwrapOk(await branch(gitCtx, repo.path, "refs/remotes/origin/main"));

    assert.deepStrictEqual(detail, {
        commit: head,
        kind: "remote-head",
        name: "main",
        remote: "origin",
    });
});

test(branch.name + " - resolves to nothing when no ref matches", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await branch(gitCtx, repo.path, "missing")), undefined);
});
