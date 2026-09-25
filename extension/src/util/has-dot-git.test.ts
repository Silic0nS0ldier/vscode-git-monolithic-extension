import test from "ava";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasDotGit } from "./has-dot-git.js";

async function withFolder(body: (folder: string) => Promise<void>): Promise<void> {
    const folder = await mkdtemp(join(tmpdir(), "has-dot-git-test-"));
    try {
        await body(folder);
    } finally {
        await rm(folder, { force: true, recursive: true });
    }
}

test("A .git directory marks a work tree", async t => {
    await withFolder(async folder => {
        await mkdir(join(folder, ".git"));
        t.true(await hasDotGit(folder));
    });
});

test("A .git file pointing at a git directory marks a linked worktree or submodule", async t => {
    await withFolder(async folder => {
        await writeFile(join(folder, ".git"), "gitdir: /elsewhere/.git/worktrees/feature\n");
        t.true(await hasDotGit(folder));
    });
});

test("A .git file that points nowhere does not", async t => {
    await withFolder(async folder => {
        await writeFile(join(folder, ".git"), "not a gitdir pointer\n");
        t.false(await hasDotGit(folder));
    });
});

test("A folder without .git does not", async t => {
    await withFolder(async folder => {
        t.false(await hasDotGit(folder));
    });
});
