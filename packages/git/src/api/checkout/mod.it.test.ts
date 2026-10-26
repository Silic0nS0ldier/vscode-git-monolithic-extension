import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo, writeUntrackedPastCliLimit } from "../helpers.it.stub.js";
import { checkout } from "./mod.js";

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

async function symbolicHead(cwd: string): Promise<string | undefined> {
    const result = await readToString({ cli: gitCtx.cli, cwd }, ["symbolic-ref", "--quiet", "HEAD"]);
    return isErr(result) ? undefined : unwrap(result).trim();
}

/**
 * `main` and a branch `topic` that changes `shared.txt`, with `HEAD` back on `main`. A fake
 * remote-tracking branch `origin/feature` points at `topic`.
 */
async function repoWithBranches() {
    const repo = await tempGitRepo(true);
    const write = (name: string, content: string) => fs.writeFile(path.join(repo.path, name), content);

    await write("shared.txt", "base\n");
    await run(repo.path, ["add", "--", "shared.txt"]);
    await run(repo.path, ["commit", "-m", "Base"]);
    await run(repo.path, ["branch", "-M", "main"]);
    await run(repo.path, ["switch", "--create", "topic"]);
    await write("shared.txt", "topic\n");
    await run(repo.path, ["commit", "--all", "-m", "Topic"]);
    await run(repo.path, ["switch", "main"]);

    // Nothing is fetched; `--track` only needs the ref to fall under a remote's fetch refspec.
    await run(repo.path, ["remote", "add", "origin", path.join(repo.path, "missing-remote.git")]);
    await run(repo.path, ["update-ref", "refs/remotes/origin/feature", "topic"]);

    return repo;
}

test(checkout.name + " - switches to a branch and updates the work tree", async () => {
    await using repo = await repoWithBranches();

    unwrapOk(await checkout(gitCtx, repo.path, "topic", []));

    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/topic");
    assert.strictEqual(await fs.readFile(path.join(repo.path, "shared.txt"), "utf8"), "topic\n");
});

test(checkout.name + " - creates a branch tracking a remote branch", async () => {
    await using repo = await repoWithBranches();

    unwrapOk(await checkout(gitCtx, repo.path, "origin/feature", [], { track: true }));

    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/feature");
    assert.strictEqual(await read(repo.path, ["rev-parse", "HEAD"]), await read(repo.path, ["rev-parse", "topic"]));
    assert.strictEqual(await read(repo.path, ["config", "branch.feature.remote"]), "origin");
    assert.strictEqual(await read(repo.path, ["config", "branch.feature.merge"]), "refs/heads/feature");
});

test(checkout.name + " - detaches HEAD at a branch's commit", async () => {
    await using repo = await repoWithBranches();

    unwrapOk(await checkout(gitCtx, repo.path, "topic", [], { detach: true }));

    assert.strictEqual(await symbolicHead(repo.path), undefined);
    assert.strictEqual(await read(repo.path, ["rev-parse", "HEAD"]), await read(repo.path, ["rev-parse", "topic"]));
});

test(checkout.name + " - restores paths from the index when given no treeish", async () => {
    await using repo = await repoWithBranches();
    const shared = path.join(repo.path, "shared.txt");
    await fs.writeFile(shared, "staged\n");
    await run(repo.path, ["add", "--", "shared.txt"]);
    await fs.writeFile(shared, "unstaged\n");
    await fs.writeFile(path.join(repo.path, "untracked.txt"), "untracked\n");

    unwrapOk(await checkout(gitCtx, repo.path, "", [shared]));

    assert.strictEqual(await fs.readFile(shared, "utf8"), "staged\n");
    assert.deepStrictEqual(await status(repo.path), { "shared.txt": "M ", "untracked.txt": "??" });
});

test(checkout.name + " - restores paths from a treeish into the index and the work tree", async () => {
    await using repo = await repoWithBranches();

    unwrapOk(await checkout(gitCtx, repo.path, "topic", ["shared.txt"]));

    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/main");
    assert.strictEqual(await fs.readFile(path.join(repo.path, "shared.txt"), "utf8"), "topic\n");
    assert.deepStrictEqual(await status(repo.path), { "shared.txt": "M " });
});

test(checkout.name + " - restores a deleted file and reads a path that starts with a dash as a path", async () => {
    await using repo = await tempGitRepo(true);
    await fs.writeFile(path.join(repo.path, "-q"), "committed\n");
    await run(repo.path, ["add", "--", "-q"]);
    await run(repo.path, ["commit", "-m", "Dash"]);
    await fs.rm(path.join(repo.path, "-q"));

    unwrapOk(await checkout(gitCtx, repo.path, "", ["-q"]));

    assert.strictEqual(await fs.readFile(path.join(repo.path, "-q"), "utf8"), "committed\n");
    assert.deepStrictEqual(await status(repo.path), {});
});

test(checkout.name + " - restores a list of paths too long for one invocation", async () => {
    await using repo = await tempGitRepo(true);
    const paths = await writeUntrackedPastCliLimit(repo.path);
    await run(repo.path, ["add", "--all"]);
    await run(repo.path, ["commit", "-m", "Many"]);
    await Promise.all(paths.map(name => fs.writeFile(path.join(repo.path, name), "changed")));

    unwrapOk(await checkout(gitCtx, repo.path, "", paths));

    assert.deepStrictEqual(await status(repo.path), {});
});

test(checkout.name + " - restores a path from the index before the first commit", async () => {
    await using repo = await tempGitRepo();
    const added = path.join(repo.path, "added.txt");
    await fs.writeFile(added, "staged\n");
    await run(repo.path, ["add", "--", "added.txt"]);
    await fs.writeFile(added, "unstaged\n");

    unwrapOk(await checkout(gitCtx, repo.path, "", ["added.txt"]));

    assert.strictEqual(await fs.readFile(added, "utf8"), "staged\n");
});

test(checkout.name + " - refuses to overwrite local changes, leaving HEAD and the work tree alone", async () => {
    await using repo = await repoWithBranches();
    await fs.writeFile(path.join(repo.path, "shared.txt"), "local\n");

    const result = await checkout(gitCtx, repo.path, "topic", []);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        // The extension recognises a dirty work tree by this line.
        assert.match(error.cause.stderr, /Please,? commit your changes or stash them/u);
    }
    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/main");
    assert.strictEqual(await fs.readFile(path.join(repo.path, "shared.txt"), "utf8"), "local\n");
});

test(checkout.name + " - fails on a treeish that does not exist", async () => {
    await using repo = await repoWithBranches();

    const result = await checkout(gitCtx, repo.path, "missing", []);

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /'missing'/u);
    }
    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/main");
});

// Pins the missing `--` after the treeish; see the TODO in `mod.ts`.
test(checkout.name + " - restores a file when the treeish names no ref but does name that file", async () => {
    await using repo = await repoWithBranches();
    await fs.writeFile(path.join(repo.path, "shared.txt"), "local\n");

    unwrapOk(await checkout(gitCtx, repo.path, "shared.txt", []));

    assert.strictEqual(await symbolicHead(repo.path), "refs/heads/main");
    assert.strictEqual(await fs.readFile(path.join(repo.path, "shared.txt"), "utf8"), "base\n");
});
