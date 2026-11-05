import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { GitContext } from "../../cli/context.js";
import { ERROR_GENERIC, ERROR_TIMEOUT, type ErrorShape, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { blockUntrackedListing, gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { untracked } from "./untracked.js";

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

test(untracked.name + " - fails once git times out, rather than when git eventually exits", async () => {
    await using repo = await tempGitRepo();
    await using _blocked = await blockUntrackedListing(repo.path);
    const timeoutMs = 250;
    const impatientCtx: GitContext = {
        ...gitCtx,
        cli: (context, args) => gitCtx.cli({ ...context, timeout: timeoutMs }, args),
    };

    // Without the kill this waits on git's output for as long as git runs, which here is forever.
    // Failing rather than waiting lets disposal release the FIFO, so the test ends.
    const result = await Promise.race([
        untracked(impatientCtx, repo.path, "relative"),
        delay(timeoutMs + 2_000, undefined, { ref: false }),
    ]);

    assert.ok(result !== undefined, "untracked() did not settle soon after the timeout");
    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_GENERIC);
    assert.strictEqual((error.cause as ErrorShape<symbol>).type, ERROR_TIMEOUT);
});
