import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo, writeUntrackedPastCliLimit } from "../helpers.it.stub.js";
import { resetPaths } from "./paths.js";

/** Path to its two-letter porcelain status code, e.g. `file.txt` -> `M ` (staged). */
async function status(cwd: string): Promise<Record<string, string>> {
    // Untrimmed: the first line can start with a space.
    const stdout = unwrapOk(
        await readToString({ cli: gitCtx.cli, cwd }, ["status", "--porcelain", "--untracked-files=all"]),
    );
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

/**
 * Two commits to `tracked.txt`, then a staged change to it and to `other.txt`, a staged new file,
 * and an unstaged change on top of the staged one in `tracked.txt`.
 */
async function repoWithStagedChanges() {
    const repo = await tempGitRepo(true);
    const write = (name: string, content: string) => fs.writeFile(path.join(repo.path, name), content);

    await write("tracked.txt", "first\n");
    await write("other.txt", "first\n");
    await run(repo.path, ["add", "--", "tracked.txt", "other.txt"]);
    await run(repo.path, ["commit", "-m", "First"]);
    await write("tracked.txt", "second\n");
    await run(repo.path, ["commit", "--all", "-m", "Second"]);

    await write("tracked.txt", "staged\n");
    await write("other.txt", "staged\n");
    await write("added.txt", "added\n");
    await run(repo.path, ["add", "--", "tracked.txt", "other.txt", "added.txt"]);
    await write("tracked.txt", "unstaged\n");

    return repo;
}

test(resetPaths.name + " - unstages only the given paths and leaves the work tree alone", async () => {
    await using repo = await repoWithStagedChanges();

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", ["tracked.txt", path.join(repo.path, "added.txt")]));

    assert.deepStrictEqual(await status(repo.path), {
        "added.txt": "??",
        "other.txt": "M ",
        "tracked.txt": " M",
    });
    assert.strictEqual(await fs.readFile(path.join(repo.path, "tracked.txt"), "utf8"), "unstaged\n");
});

test(resetPaths.name + " - unstages everything when given no paths", async () => {
    await using repo = await repoWithStagedChanges();

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", []));

    assert.deepStrictEqual(await status(repo.path), {
        "added.txt": "??",
        "other.txt": " M",
        "tracked.txt": " M",
    });
});

test(resetPaths.name + " - stages the treeish's version of the path, keeping HEAD", async () => {
    await using repo = await repoWithStagedChanges();

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD~", ["tracked.txt"]));

    assert.strictEqual(await read(repo.path, ["show", ":tracked.txt"]), "first");
    assert.strictEqual(await read(repo.path, ["log", "-1", "--format=%s"]), "Second");
});

test(resetPaths.name + " - reads a path that starts with a dash as a path", async () => {
    await using repo = await tempGitRepo(true);
    await fs.writeFile(path.join(repo.path, "-q"), "added\n");
    await run(repo.path, ["add", "--", "-q"]);

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", ["-q"]));

    assert.deepStrictEqual(await status(repo.path), { "-q": "??" });
});

test(resetPaths.name + " - unstages a list of paths too long for one invocation", async () => {
    await using repo = await tempGitRepo(true);
    const paths = await writeUntrackedPastCliLimit(repo.path);
    await run(repo.path, ["add", "--all"]);

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", paths));

    assert.strictEqual(await read(repo.path, ["diff", "--cached", "--name-only"]), "");
});

test(resetPaths.name + " - unstages a new file before the first commit", async () => {
    await using repo = await tempGitRepo();
    await fs.writeFile(path.join(repo.path, "added.txt"), "added\n");
    await run(repo.path, ["add", "--", "added.txt"]);

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", ["added.txt"]));

    assert.deepStrictEqual(await status(repo.path), { "added.txt": "??" });
});

// The extension swallows a failure that reports "needs merge" on stdout; with `-q`, current git
// resolves the conflict to the treeish instead and never reports one.
test(resetPaths.name + " - resolves a conflicted path to the treeish", async () => {
    await using repo = await tempGitRepo(true);
    const write = (content: string) => fs.writeFile(path.join(repo.path, "conflict.txt"), content);
    await write("base\n");
    await run(repo.path, ["add", "--", "conflict.txt"]);
    await run(repo.path, ["commit", "-m", "Base"]);
    await run(repo.path, ["switch", "--create", "other"]);
    await write("theirs\n");
    await run(repo.path, ["commit", "--all", "-m", "Theirs"]);
    await run(repo.path, ["switch", "-"]);
    await write("ours\n");
    await run(repo.path, ["commit", "--all", "-m", "Ours"]);
    assert.ok(isErr(await gitCtx.cli({ cwd: repo.path }, ["merge", "other"])));
    assert.deepStrictEqual(await status(repo.path), { "conflict.txt": "UU" });

    unwrapOk(await resetPaths(gitCtx, repo.path, "HEAD", []));

    assert.deepStrictEqual(await status(repo.path), { "conflict.txt": " M" });
    assert.strictEqual(await read(repo.path, ["show", ":conflict.txt"]), "ours");
});

test(resetPaths.name + " - fails on a treeish that does not exist and leaves the index alone", async () => {
    await using repo = await repoWithStagedChanges();

    const result = await resetPaths(gitCtx, repo.path, "missing", ["tracked.txt"]);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /'missing'/u);
    }
    assert.deepStrictEqual(await status(repo.path), {
        "added.txt": "A ",
        "other.txt": "M ",
        "tracked.txt": "MM",
    });
});
