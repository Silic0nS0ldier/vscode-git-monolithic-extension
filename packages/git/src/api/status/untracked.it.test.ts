import test from "node:test";
import assert from "node:assert";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import path from "node:path";
import fs from "node:fs/promises";
import { untracked } from "./untracked.js";
import { unwrapOk } from "../../errors.js";

test(untracked.name + " - relative - empty", async () => {
    await using repo = await tempGitRepo();
    const statuses = unwrapOk(await untracked(gitCtx, repo.path, "relative"));
    assert.deepStrictEqual(statuses, []);
});

test(untracked.name + " - relative - basic case", async () => {
    await using repo = await tempGitRepo();

    // Create some untracked files
    const file1 = path.join(repo.path, "file1.txt");
    const file2 = path.join(repo.path, "file2.txt");
    await fs.writeFile(file1, "Hello, world!");
    await fs.writeFile(file2, "Hello, again!");

    const statuses = unwrapOk(await untracked(gitCtx, repo.path, "relative"));
    assert.deepStrictEqual(statuses.sort(), ["file1.txt", "file2.txt"]);
});

test(untracked.name + " - relative - many files", async () => {
    await using repo = await tempGitRepo();

    // Create many untracked files
    const fileCount = 1000;
    const fileNames = [];
    for (let i = 0; i < fileCount; i++) {
        const fileName = `file${i}.txt`;
        fileNames.push(fileName);
        await fs.writeFile(path.join(repo.path, fileName), `Content of ${fileName}`);
    }

    const statuses = unwrapOk(await untracked(gitCtx, repo.path, "relative"));
    assert.deepStrictEqual(statuses.sort(), fileNames.sort());
});
