import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { fetch } from "./mod.js";

/**
 * A repository with `origin` and `secondary` bare remotes. `origin` carries a commit the
 * work tree has not seen and a branch its tracking refs still remember; `secondary` has
 * never been fetched from.
 */
async function repoWithRemotes() {
    const repo = await tempGitRepo(true);
    const origin = `${repo.path}-origin.git`;
    const secondary = `${repo.path}-secondary.git`;

    try {
        await run(repo.path, ["branch", "-M", "main"]);
        await run(repo.path, ["init", "--bare", "--initial-branch=main", origin]);
        await run(repo.path, ["remote", "add", "origin", origin]);
        await run(repo.path, ["push", "--set-upstream", "origin", "main"]);

        await run(origin, ["branch", "retired", "main"]);
        await run(repo.path, ["fetch", "origin"]);
        await run(origin, ["update-ref", "-d", "refs/heads/retired"]);

        const tree = await read(repo.path, ["rev-parse", "HEAD^{tree}"]);
        const head = await read(repo.path, ["rev-parse", "HEAD"]);
        const ahead = await read(repo.path, ["commit-tree", tree, "-p", head, "-m", "Upstream change"]);
        await run(repo.path, ["push", "origin", `${ahead}:refs/heads/main`]);
        // `git push` advances the tracking ref even for a raw object name.
        await run(repo.path, ["update-ref", "refs/remotes/origin/main", head]);

        await run(repo.path, ["clone", "--bare", repo.path, secondary]);
        await run(repo.path, ["remote", "add", "secondary", secondary]);

        return {
            ahead,
            head,
            path: repo.path,
            async [Symbol.asyncDispose]() {
                await fs.rm(origin, { force: true, recursive: true });
                await fs.rm(secondary, { force: true, recursive: true });
                await repo[Symbol.asyncDispose]();
            },
        };
    } catch (error) {
        await fs.rm(origin, { force: true, recursive: true });
        await fs.rm(secondary, { force: true, recursive: true });
        await repo[Symbol.asyncDispose]();
        throw error;
    }
}

test(fetch.name + " - advances the tracking ref of the default remote", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path));

    assert.strictEqual(await read(repo.path, ["rev-parse", "refs/remotes/origin/main"]), repo.ahead);
});

test(fetch.name + " - leaves tracking refs the remote dropped in place", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path));

    assert.strictEqual(await read(repo.path, ["rev-parse", "refs/remotes/origin/retired"]), repo.head);
});

test(fetch.name + " - prunes tracking refs the remote dropped", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path, { prune: true }));

    const result = await gitCtx.cli({ cwd: repo.path }, ["rev-parse", "--verify", "refs/remotes/origin/retired"]);
    assert.ok(isErr(result), "the retired tracking ref should be gone");
});

test(fetch.name + " - only contacts the default remote", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path));

    const result = await gitCtx.cli({ cwd: repo.path }, ["rev-parse", "--verify", "refs/remotes/secondary/main"]);
    assert.ok(isErr(result), "secondary should not have been fetched from");
});

test(fetch.name + " - contacts every remote when asked", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path, { all: true }));

    assert.strictEqual(await read(repo.path, ["rev-parse", "refs/remotes/secondary/main"]), repo.head);
});

test(fetch.name + " - fetches a single ref from a named remote", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path, { ref: "main", remote: "secondary" }));

    assert.strictEqual(await read(repo.path, ["rev-parse", "refs/remotes/origin/main"]), repo.head);
    assert.strictEqual(await read(repo.path, ["rev-parse", "FETCH_HEAD"]), repo.head);
});

test(fetch.name + " - truncates history to the requested depth", async () => {
    await using repo = await repoWithRemotes();

    unwrapOk(await fetch(gitCtx, repo.path, { depth: 1, ref: "main", remote: "origin" }));

    await fs.access(path.join(repo.path, ".git", "shallow"));
});

test(fetch.name + " - reports the failure when the remote cannot be read", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["remote", "add", "origin", path.join(repo.path, "absent.git")]);

    const result = await fetch(gitCtx, repo.path, { remote: "origin" });

    if (!isErr(result)) {
        assert.fail("fetching from a missing remote should fail");
    }
    const error = unwrap(result);
    if (error.type !== ERROR_NON_ZERO_EXIT) {
        assert.fail(`expected a non-zero exit, got ${String(error.type)}`);
    }
    assert.match(error.cause.stderr, /Could not read from remote repository/u);
});
