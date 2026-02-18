import test from "node:test";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { tracked } from "./tracked.js";
import path from "node:path";
import fs from "node:fs/promises";

test(tracked.name + " - relative - empty", async () => {
    await using repo = await tempGitRepo();
    const result = await tracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        throw unwrap(result);
    }
    const statuses = unwrap(result);
    assert.deepStrictEqual(statuses, []);
});

test(tracked.name + " - relative - basic case", async () => {
    await using repo = await tempGitRepo();

    // Create some tracked files
    const file1 = path.join(repo.path, "file1.txt");
    const file2 = path.join(repo.path, "file2.txt");
    await fs.writeFile(file1, "Hello, world!");
    await fs.writeFile(file2, "Hello, again!");
    const addResult = await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    if (isErr(addResult)) {
        throw unwrap(addResult);
    }

    const result = await tracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        throw unwrap(result);
    }
    const statuses = unwrap(result);
    assert.deepStrictEqual(statuses.map(s => s.path).sort(), ["file1.txt", "file2.txt"]);
});
