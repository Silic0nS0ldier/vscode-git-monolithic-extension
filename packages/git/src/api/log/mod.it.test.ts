import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { log } from "./mod.js";
import { unwrapOk } from "../../errors.js";

test(log.name + " - initial commit", async () => {
    await using repo = await tempGitRepo(true);

    const entries = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(entries.length, 1);
    assert.ok(entries[0].hash.length === 40, "hash should be 40 chars");
    assert.deepStrictEqual(entries[0].parents, []);
    assert.ok(entries[0].authorName.length > 0, "authorName should be set");
    assert.ok(entries[0].authorEmail.length > 0, "authorEmail should be set");
    assert.ok(entries[0].authorDate instanceof Date);
    assert.ok(entries[0].commitDate instanceof Date);
});

test(log.name + " - two commits", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "file.txt");
    await fs.writeFile(filePath, "content\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add file"]);

    const entries = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].message, "Add file");
    assert.strictEqual(entries[0].parents.length, 1);
    assert.strictEqual(entries[0].parents[0], entries[1].hash);
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

    const entries = unwrapOk(await log(gitCtx, repo.path, { path: "a.txt" }));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].message, "Add a");
});
