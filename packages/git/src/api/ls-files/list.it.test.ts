import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { lsFiles } from "./list.js";
import { unwrapOk } from "../../errors.js";

test(lsFiles.name + " - staged file", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "hello.txt");
    await fs.writeFile(filePath, "hello\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);

    const entries = unwrapOk(await lsFiles(gitCtx, repo.path, "hello.txt"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].mode, "100644");
    assert.strictEqual(entries[0].stage, "0");
    assert.strictEqual(entries[0].file, "hello.txt");
    assert.ok(entries[0].object.length === 40, "object hash should be 40 chars");
});

test(lsFiles.name + " - committed file", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "hello.txt");
    await fs.writeFile(filePath, "hello\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add hello.txt"]);

    const entries = unwrapOk(await lsFiles(gitCtx, repo.path, "hello.txt"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].file, "hello.txt");
});

test(lsFiles.name + " - unstaged file returns empty", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "untracked.txt");
    await fs.writeFile(filePath, "data\n");

    const entries = unwrapOk(await lsFiles(gitCtx, repo.path, "untracked.txt"));
    assert.deepStrictEqual(entries, []);
});

test(lsFiles.name + " - executable file mode", async () => {
    await using repo = await tempGitRepo(true);

    const scriptPath = path.join(repo.path, "run.sh");
    await fs.writeFile(scriptPath, "#!/bin/sh\n");
    await fs.chmod(scriptPath, 0o755);
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);

    const entries = unwrapOk(await lsFiles(gitCtx, repo.path, "run.sh"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].mode, "100755");
});
