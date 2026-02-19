import test from "node:test";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import path from "node:path";
import fs from "node:fs/promises";
import { untracked } from "./untracked.js";

test(untracked.name + " - relative - empty", async () => {
    await using repo = await tempGitRepo();
    const result = await untracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        throw unwrap(result);
    }
    const statuses = unwrap(result);
    assert.deepStrictEqual(statuses, []);
});

test(untracked.name + " - relative - basic case", async () => {
    await using repo = await tempGitRepo();

    // Create some untracked files
    const file1 = path.join(repo.path, "file1.txt");
    const file2 = path.join(repo.path, "file2.txt");
    await fs.writeFile(file1, "Hello, world!");
    await fs.writeFile(file2, "Hello, again!");

    const result = await untracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        throw unwrap(result);
    }
    const statuses = unwrap(result);
    assert.deepStrictEqual(statuses.sort(), ["file1.txt", "file2.txt"]);
});
