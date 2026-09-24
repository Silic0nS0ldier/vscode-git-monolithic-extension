import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { add } from "./mod.js";

/** Path to its two-letter porcelain status code, e.g. `file.txt` -> `M ` (staged). */
async function status(cwd: string): Promise<Record<string, string>> {
    const stdout = await read(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

async function repoWithChanges() {
    const repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "modified.txt"), "committed\n");
    await fs.writeFile(path.join(repo.path, "deleted.txt"), "committed\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add files"]);

    await fs.writeFile(path.join(repo.path, "modified.txt"), "working\n");
    await fs.rm(path.join(repo.path, "deleted.txt"));
    await fs.mkdir(path.join(repo.path, "nested"));
    await fs.writeFile(path.join(repo.path, "nested", "untracked.txt"), "untracked\n");

    return repo;
}

test(add.name + " - stages every change in the working tree when given no paths", async () => {
    await using repo = await repoWithChanges();

    unwrapOk(await add(gitCtx, repo.path, []));

    assert.deepStrictEqual(await status(repo.path), {
        "deleted.txt": "D ",
        "modified.txt": "M ",
        "nested/untracked.txt": "A ",
    });
});

test(add.name + " - with update, stages tracked changes and leaves untracked files alone", async () => {
    await using repo = await repoWithChanges();

    unwrapOk(await add(gitCtx, repo.path, [], { update: true }));

    assert.deepStrictEqual(await status(repo.path), {
        "deleted.txt": "D ",
        "modified.txt": "M ",
        "nested/untracked.txt": "??",
    });
});

test(add.name + " - stages only the paths given, deletions included", async () => {
    await using repo = await repoWithChanges();

    unwrapOk(await add(gitCtx, repo.path, ["deleted.txt", path.join(repo.path, "nested", "untracked.txt")]));

    assert.deepStrictEqual(await status(repo.path), {
        "deleted.txt": "D ",
        "modified.txt": " M",
        "nested/untracked.txt": "A ",
    });
});

test(add.name + " - reads a path that starts with a dash as a path", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "-A"), "dash\n");

    unwrapOk(await add(gitCtx, repo.path, ["-A"]));

    assert.deepStrictEqual(await status(repo.path), { "-A": "A " });
});

test(add.name + " - with update, fails on an untracked path and stages nothing", async () => {
    await using repo = await repoWithChanges();

    const result = await add(gitCtx, repo.path, ["modified.txt", "nested/untracked.txt"], { update: true });

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /pathspec 'nested\/untracked\.txt' did not match any file\(s\) known to git/u);
    }
    assert.strictEqual((await status(repo.path))["modified.txt"], " M");
});

test(add.name + " - fails on a path that does not exist", async () => {
    await using repo = await tempGitRepo(true);

    const result = await add(gitCtx, repo.path, ["absent.txt"]);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /pathspec 'absent\.txt' did not match any files/u);
    }
});

test(add.name + " - handles path list exceeding the CLI length limit", async () => {
    await using repo = await tempGitRepo(true);

    // Enough files that the combined pathspec exceeds MAX_CLI_LENGTH (30000)
    // and forces multiple `git add` invocations under the hood.
    const paths: string[] = [];
    for (let i = 0; i < 2000; i++) {
        const name = `untracked-with-a-reasonably-long-filename-${i}.txt`;
        await fs.writeFile(path.join(repo.path, name), "x");
        paths.push(name);
    }

    const totalLength = paths.reduce((sum, p) => sum + p.length, 0);
    assert.ok(totalLength > 30000, `pathspec should exceed chunk limit, got ${totalLength}`);

    unwrapOk(await add(gitCtx, repo.path, paths));

    assert.deepStrictEqual(await status(repo.path), Object.fromEntries(paths.map(p => [p, "A "])));
});
