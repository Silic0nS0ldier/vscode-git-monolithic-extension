import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { lsTree } from "./list.js";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";

test(lsTree.name + " - existing file at HEAD", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "hello.txt");
    await fs.writeFile(filePath, "hello\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add hello.txt"]);

    const entries = unwrapOk(await lsTree(gitCtx, repo.path, "HEAD", "hello.txt"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].mode, "100644");
    assert.strictEqual(entries[0].type, "blob");
    assert.strictEqual(entries[0].file, "hello.txt");
    assert.ok(entries[0].object.length === 40, "object hash should be 40 chars");
    assert.strictEqual(entries[0].size, "6"); // "hello\n" is 6 bytes
});

test(lsTree.name + " - file not in tree", async () => {
    await using repo = await tempGitRepo(true);

    const entries = unwrapOk(await lsTree(gitCtx, repo.path, "HEAD", "nonexistent.txt"));
    assert.deepStrictEqual(entries, []);
});

test(lsTree.name + " - executable file mode", async () => {
    await using repo = await tempGitRepo(true);

    const scriptPath = path.join(repo.path, "run.sh");
    await fs.writeFile(scriptPath, "#!/bin/sh\n");
    await fs.chmod(scriptPath, 0o755);
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add run.sh"]);

    const entries = unwrapOk(await lsTree(gitCtx, repo.path, "HEAD", "run.sh"));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].mode, "100755");
});

test(lsTree.name + " - error for invalid ref", async () => {
    await using repo = await tempGitRepo(true);

    const result = await lsTree(gitCtx, repo.path, "nosuchref", "file.txt");
    assert.ok(isErr(result), "Expected an error for an invalid ref");
});
