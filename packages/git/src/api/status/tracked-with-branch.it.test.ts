import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { trackedWithBranch } from "./tracked-with-branch.js";
import { tracked } from "./tracked.js";

test(trackedWithBranch.name + " - reports the same changes as tracked", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "old name.txt"), "renamed\n");
    await fs.writeFile(path.join(repo.path, "edited.txt"), "edited\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Initial commit"]);

    await run(repo.path, ["mv", "old name.txt", "new name.txt"]);
    await fs.appendFile(path.join(repo.path, "edited.txt"), "again\n");
    await fs.writeFile(path.join(repo.path, "added.txt"), "added\n");
    await run(repo.path, ["add", "added.txt"]);

    const { files } = unwrapOk(await trackedWithBranch(gitCtx, repo.path));

    assert.deepStrictEqual(files, unwrapOk(await tracked(gitCtx, repo.path, "relative")));
});

test(trackedWithBranch.name + " - reports the branch and its distance from the upstream", async () => {
    await using repo = await tempGitRepo(true);
    await using remote = await tempGitRepo();
    await run(remote.path, ["config", "receive.denyCurrentBranch", "ignore"]);
    await run(repo.path, ["remote", "add", "origin", remote.path]);
    await run(repo.path, ["push", "--set-upstream", "origin", "HEAD"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Ahead"]);

    const { head } = unwrapOk(await trackedWithBranch(gitCtx, repo.path));

    assert.deepStrictEqual(head, {
        ahead: 1,
        behind: 0,
        commit: await read(repo.path, ["rev-parse", "HEAD"]),
        name: await read(repo.path, ["symbolic-ref", "--short", "HEAD"]),
        upstream: { name: await read(repo.path, ["symbolic-ref", "--short", "HEAD"]), remote: "origin" },
    });
});

test(trackedWithBranch.name + " - a detached HEAD has a commit and no name", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["checkout", "--detach"]);

    const { head } = unwrapOk(await trackedWithBranch(gitCtx, repo.path));

    assert.strictEqual(head.name, undefined);
    assert.strictEqual(head.commit, await read(repo.path, ["rev-parse", "HEAD"]));
});

test(trackedWithBranch.name + " - a branch without commits has a name and no commit", async () => {
    await using repo = await tempGitRepo();

    const { files, head } = unwrapOk(await trackedWithBranch(gitCtx, repo.path));

    assert.deepStrictEqual(files, []);
    assert.strictEqual(head.commit, undefined);
    assert.strictEqual(head.name, await read(repo.path, ["symbolic-ref", "--short", "HEAD"]));
});
