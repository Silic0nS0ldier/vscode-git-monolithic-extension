import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { rm } from "./mod.js";

/** Path to its two-letter porcelain status code, e.g. `file.txt` -> `D ` (staged deletion). */
async function status(cwd: string): Promise<Record<string, string>> {
    const stdout = await read(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

async function exists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true, () => false);
}

async function repoWithFiles(...names: string[]) {
    const repo = await tempGitRepo(true);

    for (const name of names) {
        await fs.mkdir(path.dirname(path.join(repo.path, name)), { recursive: true });
        await fs.writeFile(path.join(repo.path, name), "committed\n");
    }
    await run(repo.path, ["add", "--", ...names]);
    await run(repo.path, ["commit", "-m", "Add files"]);

    return repo;
}

test(rm.name + " - removes the given paths from the index and the work tree", async () => {
    await using repo = await repoWithFiles("kept.txt", "removed.txt", "nested/removed.txt");

    unwrapOk(await rm(gitCtx, repo.path, ["removed.txt", path.join(repo.path, "nested", "removed.txt")]));

    assert.deepStrictEqual(await status(repo.path), { "nested/removed.txt": "D ", "removed.txt": "D " });
    assert.strictEqual(await exists(path.join(repo.path, "removed.txt")), false);
    assert.strictEqual(await exists(path.join(repo.path, "kept.txt")), true);
});

test(rm.name + " - reads a path that starts with a dash as a path", async () => {
    await using repo = await repoWithFiles("-r");

    unwrapOk(await rm(gitCtx, repo.path, ["-r"]));

    assert.deepStrictEqual(await status(repo.path), { "-r": "D " });
});

test(rm.name + " - removes nothing when given no paths", async () => {
    await using repo = await repoWithFiles("kept.txt");

    unwrapOk(await rm(gitCtx, repo.path, []));

    assert.deepStrictEqual(await status(repo.path), {});
});

test(rm.name + " - resolves deletion conflicts by deleting the file", async () => {
    await using repo = await repoWithFiles("deleted-by-them.txt", "deleted-by-us.txt");
    await run(repo.path, ["switch", "--create", "other"]);
    await run(repo.path, ["rm", "deleted-by-them.txt"]);
    await fs.writeFile(path.join(repo.path, "deleted-by-us.txt"), "theirs\n");
    await run(repo.path, ["commit", "--all", "-m", "Theirs"]);
    await run(repo.path, ["switch", "-"]);
    await fs.writeFile(path.join(repo.path, "deleted-by-them.txt"), "ours\n");
    await run(repo.path, ["rm", "deleted-by-us.txt"]);
    await run(repo.path, ["commit", "--all", "-m", "Ours"]);
    assert.ok(isErr(await gitCtx.cli({ cwd: repo.path }, ["merge", "other"])));
    assert.deepStrictEqual(await status(repo.path), { "deleted-by-them.txt": "UD", "deleted-by-us.txt": "DU" });

    unwrapOk(await rm(gitCtx, repo.path, ["deleted-by-them.txt", "deleted-by-us.txt"]));

    assert.deepStrictEqual(await status(repo.path), { "deleted-by-them.txt": "D " });
    assert.strictEqual(await exists(path.join(repo.path, "deleted-by-them.txt")), false);
    assert.strictEqual(await exists(path.join(repo.path, "deleted-by-us.txt")), false);
});

test(rm.name + " - refuses a file with local modifications and removes nothing", async () => {
    await using repo = await repoWithFiles("modified.txt", "clean.txt");
    await fs.writeFile(path.join(repo.path, "modified.txt"), "working\n");

    const result = await rm(gitCtx, repo.path, ["clean.txt", "modified.txt"]);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /the following file has local modifications:\n {4}modified\.txt/u);
    }
    assert.strictEqual(await read(repo.path, ["diff", "--cached", "--name-only"]), "");
    assert.strictEqual(await exists(path.join(repo.path, "clean.txt")), true);
});

test(rm.name + " - fails on a path that does not exist", async () => {
    await using repo = await tempGitRepo(true);

    const result = await rm(gitCtx, repo.path, ["absent.txt"]);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /pathspec 'absent\.txt' did not match any files/u);
    }
});
