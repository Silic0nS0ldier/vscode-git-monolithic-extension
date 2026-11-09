import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import type { GitContext } from "../../cli/context.js";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { logWithSources } from "../log/mod.js";
import { gitLayout } from "./git-layout.js";

test(gitLayout.name + " identifies linked worktrees and distinguishes another repository", async () => {
    await using repo = await tempGitRepo(true);
    await using other = await tempGitRepo(true);
    const worktree = path.join(repo.path, "linked");
    await run(repo.path, ["worktree", "add", "-b", "linked", worktree]);
    const layout = unwrapOk(await gitLayout(gitCtx, repo.path));
    assert.deepStrictEqual(layout, {
        commonDir: path.join(repo.path, ".git"),
        objectsDir: path.join(repo.path, ".git", "objects"),
    });
    assert.deepStrictEqual(unwrapOk(await gitLayout(gitCtx, worktree)), layout);
    assert.notStrictEqual(unwrapOk(await gitLayout(gitCtx, other.path)).commonDir, layout.commonDir);
    assert.ok(isErr(await gitLayout(gitCtx, repo.path, AbortSignal.abort())));
});

test(gitLayout.name + " honors object-directory overrides separately in each worktree", async () => {
    await using repo = await tempGitRepo(true);
    const worktree = path.join(repo.path, "linked");
    await run(repo.path, ["worktree", "add", "-b", "linked", worktree]);
    for (const root of [repo.path, worktree]) {
        await fs.mkdir(path.join(root, "local-objects", "info"), { recursive: true });
        await fs.mkdir(path.join(root, "local-objects", "pack"));
    }
    const git: GitContext = {
        ...gitCtx,
        cli: (context, args) =>
            gitCtx.cli({
                ...context,
                env: {
                    ...context.env,
                    GIT_OBJECT_DIRECTORY: "local-objects",
                    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repo.path, ".git", "objects"),
                },
            }, args),
    };
    const primary = unwrapOk(await gitLayout(git, repo.path));
    const linked = unwrapOk(await gitLayout(git, worktree));
    assert.strictEqual(primary.commonDir, linked.commonDir);
    assert.strictEqual(primary.objectsDir, path.join(repo.path, "local-objects"));
    assert.strictEqual(linked.objectsDir, path.join(worktree, "local-objects"));
});

test("Relative alternates can give linked worktrees different reachable objects", async () => {
    await using repo = await tempGitRepo(true);
    const worktree = path.join(repo.path, "linked");
    await run(repo.path, ["worktree", "add", "-b", "linked", worktree]);
    for (const root of [repo.path, worktree]) {
        await fs.mkdir(path.join(root, "local-objects", "info"), { recursive: true });
        await fs.mkdir(path.join(root, "local-objects", "pack"));
    }
    const tree = await read(repo.path, ["rev-parse", "HEAD^{tree}"]);
    const parent = await read(repo.path, ["rev-parse", "HEAD"]);
    const commit = unwrapOk(
        await readToString({
            cli: (context, args) =>
                gitCtx.cli({
                    ...context,
                    env: {
                        ...context.env,
                        GIT_OBJECT_DIRECTORY: "local-objects",
                        GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repo.path, ".git", "objects"),
                    },
                }, args),
            cwd: repo.path,
            stdin: Readable.from(["Only in the primary worktree's alternate\n"]),
        }, ["commit-tree", tree, "-p", parent]),
    ).trim();
    const git: GitContext = {
        ...gitCtx,
        cli: (context, args) =>
            gitCtx.cli({
                ...context,
                env: { ...context.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: "local-objects" },
            }, args),
    };
    assert.deepStrictEqual(unwrapOk(await gitLayout(git, repo.path)), unwrapOk(await gitLayout(git, worktree)));
    assert.strictEqual(unwrapOk(await logWithSources(git, repo.path, { hashes: [commit] })).length, 2);
    assert.ok(isErr(await logWithSources(git, worktree, { hashes: [commit] })));
});
