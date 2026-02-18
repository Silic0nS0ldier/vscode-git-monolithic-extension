import test from "ava";
import { isErr, unwrap } from "../../func-result.js";
import { inspect } from "node:util";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import path from "node:path";
import fs from "node:fs/promises";
import { untracked } from "./untracked.js";

test(untracked.name + " - relative - empty", async t => {
    await using repo = await tempGitRepo();
    const result = await untracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        t.fail(`Expected untracked to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const statuses = unwrap(result);
    t.deepEqual(statuses, []);
});

test(untracked.name + " - relative - basic case", async t => {
    await using repo = await tempGitRepo();

    // Create some untracked files
    const file1 = path.join(repo.path, "file1.txt");
    const file2 = path.join(repo.path, "file2.txt");
    await fs.writeFile(file1, "Hello, world!");
    await fs.writeFile(file2, "Hello, again!");

    const result = await untracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        t.fail(`Expected untracked to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const statuses = unwrap(result);
    t.deepEqual(statuses.sort(), ["file1.txt", "file2.txt"]);
});
