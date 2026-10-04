import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { log } from "./mod.js";

test(log.name + " - initial commit", async () => {
    await using repo = await tempGitRepo(true);

    const [commit, ...extras] = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(extras.length, 0);
    assert.ok(commit != null);
    assert.ok(commit.hash.length === 40, "hash should be 40 chars");
    assert.deepStrictEqual(commit.parents, []);
    assert.ok(commit.authorName.length > 0, "authorName should be set");
    assert.ok(commit.authorEmail.length > 0, "authorEmail should be set");
    assert.ok(commit.authorDate instanceof Date);
    assert.ok(commit.commitDate instanceof Date);
});

test(log.name + " - two commits", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "file.txt");
    await fs.writeFile(filePath, "content\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add file"]);

    const [commitOne, commitTwo, ...extras] = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(extras.length, 0);
    assert.ok(commitOne != null);
    assert.strictEqual(commitOne.message, "Add file");
    assert.strictEqual(commitOne.parents.length, 1);
    assert.ok(commitTwo != null);
    assert.strictEqual(commitOne.parents[0], commitTwo.hash);
});

test(log.name + " - maxEntries limits results", async () => {
    await using repo = await tempGitRepo(true);

    for (let i = 0; i < 5; i++) {
        await fs.writeFile(path.join(repo.path, `f${i}.txt`), `${i}`);
        await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
        await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", `commit ${i}`]);
    }

    const entries = unwrapOk(await log(gitCtx, repo.path, { maxEntries: 3 }));
    assert.strictEqual(entries.length, 3);
});

test(log.name + " - path filter", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "a.txt"), "a");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add a"]);

    await fs.writeFile(path.join(repo.path, "b.txt"), "b");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add b"]);

    const [commit, ...extras] = unwrapOk(await log(gitCtx, repo.path, { path: "a.txt" }));
    assert.strictEqual(extras.length, 0);
    assert.ok(commit != null);
    assert.strictEqual(commit.message, "Add a");
});
