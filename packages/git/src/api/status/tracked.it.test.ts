import test from "ava";
import { isErr, unwrap } from "../../func-result.js";
import { inspect } from "node:util";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { tracked } from "./tracked.js";
import path from "node:path";
import fs from "node:fs/promises";

test(tracked.name + " - relative - empty", async t => {
    await using repo = await tempGitRepo();
    const result = await tracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        t.fail(`Expected tracked to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const statuses = unwrap(result);
    t.deepEqual(statuses, []);
});

test(tracked.name + " - relative - basic case", async t => {
    await using repo = await tempGitRepo();

    // Create some tracked files
    const file1 = path.join(repo.path, "file1.txt");
    const file2 = path.join(repo.path, "file2.txt");
    await fs.writeFile(file1, "Hello, world!");
    await fs.writeFile(file2, "Hello, again!");
    const addResult = await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    if (isErr(addResult)) {
        t.fail(`Failed to add files: ${inspect(unwrap(addResult))}`);
        return;
    }

    const result = await tracked(gitCtx, repo.path, "relative");
    if (isErr(result)) {
        t.fail(`Expected tracked to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const statuses = unwrap(result);
    t.deepEqual(statuses.map(s => s.path).sort(), ["file1.txt", "file2.txt"]);
});
