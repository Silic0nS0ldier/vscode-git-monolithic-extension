import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { tracked } from "./tracked.js";

test(tracked.name + " - relative - empty", async () => {
    await using repo = await tempGitRepo();
    const statuses = unwrapOk(await tracked(gitCtx, repo.path, "relative"));
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
        throw unwrap(addResult)._error;
    }

    const statuses = unwrapOk(await tracked(gitCtx, repo.path, "relative"));
    assert.deepStrictEqual(statuses.map(s => s.path).sort(), ["file1.txt", "file2.txt"]);
});
