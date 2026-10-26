import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo, writeUntrackedPastCliLimit } from "../helpers.it.stub.js";
import { rmCached } from "./cached.js";

/** Path to its two-letter porcelain status code, e.g. `file.txt` -> `A ` (staged addition). */
async function status(cwd: string): Promise<Record<string, string>> {
    // Untrimmed: the first line can start with a space.
    const stdout = unwrapOk(
        await readToString({ cli: gitCtx.cli, cwd }, ["status", "--porcelain", "--untracked-files=all"]),
    );
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

/** No commit, and `kept.txt`, `removed.txt` and `nested/removed.txt` staged. */
async function unbornRepoWithStagedFiles() {
    const repo = await tempGitRepo();

    for (const name of ["kept.txt", "removed.txt", "nested/removed.txt"]) {
        await fs.mkdir(path.dirname(path.join(repo.path, name)), { recursive: true });
        await fs.writeFile(path.join(repo.path, name), "staged\n");
    }
    await run(repo.path, ["add", "--all"]);

    return repo;
}

test(rmCached.name + " - drops the given paths from the index and keeps them in the work tree", async () => {
    await using repo = await unbornRepoWithStagedFiles();

    unwrapOk(await rmCached(gitCtx, repo.path, ["removed.txt", path.join(repo.path, "nested")]));

    assert.deepStrictEqual(await status(repo.path), {
        "kept.txt": "A ",
        "nested/removed.txt": "??",
        "removed.txt": "??",
    });
    assert.strictEqual(await fs.readFile(path.join(repo.path, "removed.txt"), "utf8"), "staged\n");
});

test(rmCached.name + " - drops everything when given no paths", async () => {
    await using repo = await unbornRepoWithStagedFiles();

    unwrapOk(await rmCached(gitCtx, repo.path, []));

    assert.deepStrictEqual(await status(repo.path), {
        "kept.txt": "??",
        "nested/removed.txt": "??",
        "removed.txt": "??",
    });
});

test(rmCached.name + " - untracks what the deleted root commit held", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "committed.txt"), "committed\n");
    await run(repo.path, ["add", "--", "committed.txt"]);
    await run(repo.path, ["commit", "-m", "Root"]);
    await run(repo.path, ["update-ref", "-d", "HEAD"]);

    unwrapOk(await rmCached(gitCtx, repo.path, []));

    assert.deepStrictEqual(await status(repo.path), { "committed.txt": "??" });
});

test(rmCached.name + " - reads a path that starts with a dash as a path", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "-f"), "staged\n");
    await run(repo.path, ["add", "--", "-f"]);

    unwrapOk(await rmCached(gitCtx, repo.path, ["-f"]));

    assert.deepStrictEqual(await status(repo.path), { "-f": "??" });
});

test(rmCached.name + " - drops a list of paths too long for one invocation", async () => {
    await using repo = await tempGitRepo();
    const paths = await writeUntrackedPastCliLimit(repo.path);
    await run(repo.path, ["add", "--all"]);

    unwrapOk(await rmCached(gitCtx, repo.path, paths));

    assert.strictEqual(await read(repo.path, ["ls-files"]), "");
});

test(rmCached.name + " - fails when the index is already empty", async () => {
    await using repo = await tempGitRepo();

    const result = await rmCached(gitCtx, repo.path, []);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /pathspec '\.' did not match any files/u);
    }
});

// Pins the TODO in `cached.ts`: undoing a root commit whose files were since modified fails.
test(rmCached.name + " - refuses a file the work tree changed since the deleted root commit", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "committed.txt"), "committed\n");
    await run(repo.path, ["add", "--", "committed.txt"]);
    await run(repo.path, ["commit", "-m", "Root"]);
    await run(repo.path, ["update-ref", "-d", "HEAD"]);
    await fs.writeFile(path.join(repo.path, "committed.txt"), "modified\n");

    const result = await rmCached(gitCtx, repo.path, []);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /staged content different from both the\s+file and the HEAD/u);
    }
    assert.deepStrictEqual(await status(repo.path), { "committed.txt": "AM" });
});
