import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../errors.js";
import { isErr } from "../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "./helpers.it.stub.js";
import { commit, show } from "./show.js";

test(show.name, async () => {
    await using repo = await tempGitRepo(true);

    // Create and commit a file
    const filePath = path.join(repo.path, "test.txt");
    const fileContent = "Hello, show API!\n";
    await fs.writeFile(filePath, fileContent);
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add test.txt"]);

    // Get file contents from 'HEAD' (long form)
    const contentBuffer = unwrapOk(await show(gitCtx, repo.path, "HEAD:test.txt"));
    const contentStr = contentBuffer.toString("utf-8");
    assert.strictEqual(contentStr, fileContent, "Content from show should match original file content");

    // Get file contents from 'HEAD' (short form)
    const contentBufferShort = unwrapOk(await show(gitCtx, repo.path, ":test.txt"));
    const contentStrShort = contentBufferShort.toString("utf-8");
    assert.strictEqual(
        contentStrShort,
        fileContent,
        "Content from show (short form) should match original file content",
    );

    // Test non-existent file
    const nonExistentResult = await show(gitCtx, repo.path, "HEAD:nonexistent.txt");
    assert(isErr(nonExistentResult), "Expected an error for non-existent file");
});

test(commit.name, async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "test.txt"), "content");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Subject", "-m", "Body line"], {
        GIT_AUTHOR_DATE: "@1000000000 +0000",
        GIT_COMMITTER_DATE: "@1000000001 +0000",
    });

    const parent = await read(repo.path, ["rev-parse", "HEAD~1"]);
    const head = unwrapOk(await commit(gitCtx, repo.path, "HEAD"));

    assert.deepStrictEqual(head, {
        authorDate: new Date(1000000000 * 1000),
        authorEmail: "test@example.com",
        authorName: "Test User",
        commitDate: new Date(1000000001 * 1000),
        hash: await read(repo.path, ["rev-parse", "HEAD"]),
        // The body survives, and the trailing newline git appends does not.
        message: "Subject\n\nBody line",
        parents: [parent],
    });
});

test(commit.name + " - fails for an unknown revision", async () => {
    await using repo = await tempGitRepo(true);

    assert.ok(isErr(await commit(gitCtx, repo.path, "does-not-exist")));
});
