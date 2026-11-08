import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_BUFFER_OVERFLOW, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
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

test(log.name + " - topological order keeps both sides of a merge before their newer-dated parent", async () => {
    await using repo = await tempGitRepo();
    const date = (value: string): Record<string, string> => ({
        GIT_AUTHOR_DATE: value,
        GIT_COMMITTER_DATE: value,
    });
    await run(repo.path, ["commit", "--allow-empty", "-m", "Root"], date("2030-01-01T00:00:00Z"));
    await run(repo.path, ["switch", "-c", "side"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Side"], date("2020-01-01T00:00:00Z"));
    await run(repo.path, ["switch", "-"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Main"], date("2020-01-02T00:00:00Z"));
    await run(repo.path, ["merge", "--no-ff", "side", "-m", "Merge"], date("2020-01-03T00:00:00Z"));

    const normal = unwrapOk(await log(gitCtx, repo.path, { maxEntries: 10 })).map(commit => commit.message);
    assert.ok(normal.indexOf("Root") < normal.indexOf("Side"), "the fixture must expose timestamp ordering");
    const topological = unwrapOk(await log(gitCtx, repo.path, { maxEntries: 10, topoOrder: true }))
        .map(commit => commit.message);
    assert.strictEqual(topological[0], "Merge");
    assert.strictEqual(topological.at(-1), "Root");
    assert.deepStrictEqual(new Set(topological.slice(1, -1)), new Set(["Main", "Side"]));
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

test(log.name + " - folder pages keep their traversal tip when HEAD changes", async () => {
    await using repo = await tempGitRepo(true);
    await fs.mkdir(path.join(repo.path, "folder"));
    for (const name of ["First", "Second", "Third"]) {
        await fs.writeFile(path.join(repo.path, "folder", `${name}.txt`), name);
        await run(repo.path, ["add", "folder"]);
        await run(repo.path, ["commit", "-m", name]);
    }
    await fs.writeFile(path.join(repo.path, "outside.txt"), "outside");
    await run(repo.path, ["add", "outside.txt"]);
    await run(repo.path, ["commit", "-m", "Outside"]);
    const tip = await read(repo.path, ["rev-parse", "HEAD"]);
    const options = { path: "folder", hash: tip, topoOrder: true };
    const first = unwrapOk(await log(gitCtx, repo.path, { ...options, maxEntries: 2 }));
    await fs.writeFile(path.join(repo.path, "folder", "new.txt"), "new");
    await run(repo.path, ["add", "folder"]);
    await run(repo.path, ["commit", "-m", "New HEAD"]);
    const next = unwrapOk(await log(gitCtx, repo.path, { ...options, skip: 2, maxEntries: 2 }));
    assert.deepStrictEqual([...first, ...next].map(commit => commit.message), ["Third", "Second", "First"]);
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

test(log.name + " - discards earlier commits without losing followed renames or buffering them", async () => {
    await using repo = await tempGitRepo();
    // Filenames shaped like commit records, and a discarded prefix far larger than the kept page.
    const oldPath = `${"1".repeat(40)}\nFake Author\nfake@example.invalid\n1000000000\n1000000001\n\nNot a commit\n`;
    const newPath = `renamed\n${oldPath}`;
    await fs.writeFile(path.join(repo.path, oldPath), "one\n");
    await run(repo.path, ["add", "--", oldPath]);
    await run(repo.path, ["commit", "-m", "Create file"]);
    await run(repo.path, ["mv", "--", oldPath, newPath]);
    await run(repo.path, ["commit", "-m", "Rename file"]);
    const large = "x".repeat(4 * 1024 * 1024);
    for (let index = 0; index < 3; index++) {
        await fs.appendFile(path.join(repo.path, newPath), `${index}\n`);
        const message = path.join(repo.path, ".git", "TEST_MESSAGE");
        await fs.writeFile(message, `${large}${index}`);
        await run(repo.path, ["commit", "-a", "-F", message]);
    }
    const options = { path: `:(literal)${newPath}`, follow: true, filePaths: true, shortStats: true };

    const overflow = await log(gitCtx, repo.path, { ...options, maxEntries: 10 });
    assert.ok(isErr(overflow) && unwrap(overflow).type === ERROR_BUFFER_OVERFLOW);
    const page = unwrapOk(await log(gitCtx, repo.path, { ...options, discard: 3, maxEntries: 10 }));
    assert.deepStrictEqual(page.map(commit => [commit.message, commit.filePath, commit.hash]), [
        ["Rename file", newPath, await read(repo.path, ["rev-parse", "HEAD~3"])],
        ["Create file", oldPath, await read(repo.path, ["rev-parse", "HEAD~4"])],
    ]);
    assert.deepStrictEqual(page[0]?.shortStat, { files: 1, insertions: 0, deletions: 0 });
    assert.deepStrictEqual(
        unwrapOk(await log(gitCtx, repo.path, { ...options, discard: 1, maxEntries: 1 })).map(c => c.message),
        [`${large}1`],
    );
    assert.deepStrictEqual(unwrapOk(await log(gitCtx, repo.path, { ...options, discard: 5 })), []);
    assert.ok(isErr(await log(gitCtx, repo.path, { ...options, discard: -1 })));
});
