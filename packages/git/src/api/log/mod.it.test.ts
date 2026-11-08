import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { log } from "./mod.js";

test(log.name + " - initial commit", async () => {
    await using repo = await tempGitRepo(true);

    const [commit, ...extras] = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(extras.length, 0);
    assert.ok(commit != null);
    assert.ok(commit.hash.length === 40, "hash should be 40 chars");
    assert.deepStrictEqual(commit.parents, []);
    assert.ok(commit.authorName.length > 0, "authorName should be set");
    assert.ok(commit.authorEmail.length > 0, "authorEmail should be set");
    assert.ok(commit.authorDate instanceof Date);
    assert.ok(commit.commitDate instanceof Date);
});

test(log.name + " - two commits", async () => {
    await using repo = await tempGitRepo(true);

    const filePath = path.join(repo.path, "file.txt");
    await fs.writeFile(filePath, "content\n");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add file"]);

    const [commitOne, commitTwo, ...extras] = unwrapOk(await log(gitCtx, repo.path));
    assert.strictEqual(extras.length, 0);
    assert.ok(commitOne != null);
    assert.strictEqual(commitOne.message, "Add file");
    assert.strictEqual(commitOne.parents.length, 1);
    assert.ok(commitTwo != null);
    assert.strictEqual(commitOne.parents[0], commitTwo.hash);
});

test(log.name + " - maxEntries limits results", async () => {
    await using repo = await tempGitRepo(true);

    for (let i = 0; i < 5; i++) {
        await fs.writeFile(path.join(repo.path, `f${i}.txt`), `${i}`);
        await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
        await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", `commit ${i}`]);
    }

    const entries = unwrapOk(await log(gitCtx, repo.path, { maxEntries: 3 }));
    assert.strictEqual(entries.length, 3);
});

test(log.name + " - path filter", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "a.txt"), "a");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add a"]);

    await fs.writeFile(path.join(repo.path, "b.txt"), "b");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add b"]);

    const [commit, ...extras] = unwrapOk(await log(gitCtx, repo.path, { path: "a.txt" }));
    assert.strictEqual(extras.length, 0);
    assert.ok(commit != null);
    assert.strictEqual(commit.message, "Add a");
});

test(log.name + " - follows renamed files with their historical paths and statistics", async () => {
    await using repo = await tempGitRepo();
    const oldPath = "old\tname.txt";
    const newPath = "renamed\nname.txt";
    await fs.writeFile(path.join(repo.path, oldPath), "one\n");
    await run(repo.path, ["add", "--", oldPath]);
    await run(repo.path, ["commit", "-m", "Create file"]);
    await run(repo.path, ["mv", "--", oldPath, newPath]);
    await run(repo.path, ["commit", "-m", "Rename file"]);
    await fs.appendFile(path.join(repo.path, newPath), "two\n");
    await run(repo.path, ["commit", "-am", "Change renamed file"]);

    const commits = unwrapOk(
        await log(gitCtx, repo.path, {
            path: newPath,
            follow: true,
            filePaths: true,
            shortStats: true,
            maxEntries: 10,
        }),
    );
    assert.deepStrictEqual(commits.map(c => [c.message, c.filePath]), [
        ["Change renamed file", newPath],
        ["Rename file", newPath],
        ["Create file", oldPath],
    ]);
    assert.deepStrictEqual(commits[0]?.shortStat, { files: 1, insertions: 1, deletions: 0 });
    const literal = unwrapOk(
        await log(gitCtx, repo.path, {
            path: `:(literal)${path.join(repo.path, newPath)}`,
            follow: true,
            filePaths: true,
            shortStats: true,
            maxEntries: 10,
        }),
    );
    assert.deepStrictEqual(literal, commits, "the provider's absolute literal pathspec preserves rename history");
    const page = unwrapOk(
        await log(gitCtx, repo.path, {
            path: oldPath,
            hash: commits[2]?.hash,
            follow: true,
            filePaths: true,
            shortStats: true,
            maxEntries: 2,
        }),
    );
    assert.deepStrictEqual(page.map(c => c.message), ["Create file"]);
});

test(log.name + " - pages workspace history and preserves UTF-8 messages regardless of git configuration", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Second"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Third"]);
    await run(repo.path, ["config", "i18n.logOutputEncoding", "UTF-16"]);
    const commits = unwrapOk(await log(gitCtx, repo.path, { skip: 1, maxEntries: 1, shortStats: true }));
    assert.deepStrictEqual(commits.map(c => c.message), ["Second"]);
});

test(log.name + " - treats an unborn repository as empty but preserves other failures", async () => {
    await using repo = await tempGitRepo();
    assert.deepStrictEqual(unwrapOk(await log(gitCtx, repo.path)), []);
    assert.ok(isErr(await log(gitCtx, repo.path, { hash: "not-a-revision" })));
    await run(repo.path, ["commit", "--allow-empty", "-m", "Root"]);
    assert.strictEqual(unwrapOk(await log(gitCtx, repo.path))[0]?.hash, await read(repo.path, ["rev-parse", "HEAD"]));
});

test(log.name + " - respects cancellation", async () => {
    await using repo = await tempGitRepo(true);
    const result = await log(gitCtx, repo.path, { signal: AbortSignal.abort() });
    assert.ok(isErr(result));
});

test(log.name + " - preserves renamed filenames containing complete commit-shaped records", async () => {
    await using repo = await tempGitRepo();
    const oldPath = `${"a".repeat(40)}\nFake Author\nfake@example.invalid\n1000000000\n1000000001\n\nNot a commit\n`;
    const newPath = `renamed\n${oldPath}`;
    await fs.writeFile(path.join(repo.path, oldPath), "content\n");
    await run(repo.path, ["add", "--", oldPath]);
    await run(repo.path, ["commit", "-m", "Create unusual file"]);
    await run(repo.path, ["mv", "--", oldPath, newPath]);
    await run(repo.path, ["commit", "-m", "Rename unusual file"]);
    const commits = unwrapOk(
        await log(gitCtx, repo.path, {
            path: `:(literal)${newPath}`,
            follow: true,
            filePaths: true,
            shortStats: true,
        }),
    );
    assert.deepStrictEqual(commits.map(commit => [commit.hash, commit.filePath]), [
        [await read(repo.path, ["rev-parse", "HEAD"]), newPath],
        [await read(repo.path, ["rev-parse", "HEAD^"]), oldPath],
    ]);
});
