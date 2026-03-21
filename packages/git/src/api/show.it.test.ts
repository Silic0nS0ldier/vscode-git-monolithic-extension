import test from "node:test";
import assert from "node:assert";
import { isErr } from "../func-result.js";
import { tempGitRepo, gitCtx } from "./helpers.it.stub.js";
import { show } from "./show.js";
import path from "node:path";
import fs from "node:fs/promises";
import { unwrapOk } from "../errors.js";

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
    assert.strictEqual(contentStrShort, fileContent, "Content from show (short form) should match original file content");

    // Test non-existent file
    const nonExistentResult = await show(gitCtx, repo.path, "HEAD:nonexistent.txt");
    assert(isErr(nonExistentResult), "Expected an error for non-existent file");
});
