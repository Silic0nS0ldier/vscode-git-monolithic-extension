import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { reset } from "./mod.js";

/** Path to its two-letter porcelain status code, e.g. `file.txt` -> `M ` (staged). */
async function status(cwd: string): Promise<Record<string, string>> {
    const stdout = await read(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

async function subject(cwd: string): Promise<string> {
    return (await read(cwd, ["log", "-1", "--format=%s"])).trim();
}

/**
 * Two commits to `tracked.txt`, then a staged change to `staged.txt`, an unstaged change on top
 * of the second commit, and an untracked file.
 */
async function repoWithChanges() {
    const repo = await tempGitRepo(true);
    const write = (name: string, content: string) => fs.writeFile(path.join(repo.path, name), content);

    await write("tracked.txt", "first\n");
    await write("staged.txt", "first\n");
    await run(repo.path, ["add", "--", "tracked.txt", "staged.txt"]);
    await run(repo.path, ["commit", "-m", "First"]);
    await write("tracked.txt", "second\n");
    await run(repo.path, ["commit", "--all", "-m", "Second"]);

    await write("staged.txt", "staged\n");
    await run(repo.path, ["add", "--", "staged.txt"]);
    await write("tracked.txt", "unstaged\n");
    await write("untracked.txt", "untracked\n");

    return repo;
}

test(reset.name + " - soft reset moves HEAD and keeps the index and the work tree", async () => {
    await using repo = await repoWithChanges();

    unwrapOk(await reset(gitCtx, repo.path, "HEAD~", { mode: "soft" }));

    assert.strictEqual(await subject(repo.path), "First");
    assert.deepStrictEqual(await status(repo.path), {
        "staged.txt": "M ",
        "tracked.txt": "MM",
        "untracked.txt": "??",
    });
    assert.strictEqual(await fs.readFile(path.join(repo.path, "tracked.txt"), "utf8"), "unstaged\n");
});

test(reset.name + " - hard reset discards tracked changes and keeps untracked files", async () => {
    await using repo = await repoWithChanges();

    unwrapOk(await reset(gitCtx, repo.path, "HEAD~", { mode: "hard" }));

    assert.strictEqual(await subject(repo.path), "First");
    assert.deepStrictEqual(await status(repo.path), { "untracked.txt": "??" });
    assert.strictEqual(await fs.readFile(path.join(repo.path, "tracked.txt"), "utf8"), "first\n");
    assert.strictEqual(await fs.readFile(path.join(repo.path, "staged.txt"), "utf8"), "first\n");
});

test(reset.name + " - fails on a revision that does not exist and leaves HEAD alone", async () => {
    await using repo = await repoWithChanges();

    const result = await reset(gitCtx, repo.path, "missing", { mode: "hard" });

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /ambiguous argument 'missing': unknown revision/u);
    }
    assert.strictEqual(await subject(repo.path), "Second");
});

test(reset.name + " - fails when there is no commit to reset to", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "file.txt"), "content\n");
    await run(repo.path, ["add", "--", "file.txt"]);
    await run(repo.path, ["commit", "-m", "Root"]);

    const result = await reset(gitCtx, repo.path, "HEAD~", { mode: "soft" });

    assert.ok(isErr(result));
    assert.strictEqual(unwrap(result).type, ERROR_NON_ZERO_EXIT);
    assert.strictEqual(await subject(repo.path), "Root");
});

// Pins the TODO in `mod.ts`: without `--`, git cannot tell the revision from the file.
test(reset.name + " - fails when a file is named like the revision", async () => {
    await using repo = await repoWithChanges();
    await fs.writeFile(path.join(repo.path, "HEAD~"), "");

    const result = await reset(gitCtx, repo.path, "HEAD~", { mode: "soft" });

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /ambiguous argument 'HEAD~': both revision and filename/u);
    }
    assert.strictEqual(await subject(repo.path), "Second");
});
