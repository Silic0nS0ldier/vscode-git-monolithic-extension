import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { staged, unstaged } from "./path.js";

/** Body of the diff, without the header lines naming the blobs involved. */
function changedLines(diff: string): string[] {
    return diff.split("\n").filter(line => /^[+-][^+-]/u.test(line));
}

test(unstaged.name + " - reports a change that has not been staged", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file.txt"]);
    await fs.writeFile(path.join(repo.path, "file.txt"), "working\n");

    const diff = unwrapOk(await unstaged(gitCtx, repo.path, "file.txt"));

    assert.deepStrictEqual(changedLines(diff), ["-committed", "+working"]);
});

test(unstaged.name + " - reports nothing once the change is staged", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file.txt"]);
    await fs.writeFile(path.join(repo.path, "file.txt"), "staged\n");
    await run(repo.path, ["add", "."]);

    assert.strictEqual(unwrapOk(await unstaged(gitCtx, repo.path, "file.txt")), "");
});

test(staged.name + " - reports the change staged over the committed content", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file.txt"]);
    await fs.writeFile(path.join(repo.path, "file.txt"), "staged\n");
    await run(repo.path, ["add", "."]);

    const diff = unwrapOk(await staged(gitCtx, repo.path, "file.txt"));

    assert.deepStrictEqual(changedLines(diff), ["-committed", "+staged"]);
});

test("each reads its own side when a path is both staged and modified", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file.txt"]);
    await fs.writeFile(path.join(repo.path, "file.txt"), "staged\n");
    await run(repo.path, ["add", "."]);
    await fs.writeFile(path.join(repo.path, "file.txt"), "working\n");

    assert.deepStrictEqual(changedLines(unwrapOk(await staged(gitCtx, repo.path, "file.txt"))), [
        "-committed",
        "+staged",
    ]);
    assert.deepStrictEqual(changedLines(unwrapOk(await unstaged(gitCtx, repo.path, "file.txt"))), [
        "-staged",
        "+working",
    ]);
});

test("a path with no changes yields an empty diff", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file.txt"]);

    assert.strictEqual(unwrapOk(await unstaged(gitCtx, repo.path, "file.txt")), "");
    assert.strictEqual(unwrapOk(await staged(gitCtx, repo.path, "file.txt")), "");
});

test("a path git does not know about yields an empty diff rather than an error", async () => {
    await using repo = await tempGitRepo(true);

    assert.strictEqual(unwrapOk(await unstaged(gitCtx, repo.path, "absent.txt")), "");
});
