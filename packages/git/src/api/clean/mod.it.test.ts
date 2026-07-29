import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, tempGitRepo } from "../helpers.it.stub.js";
import { clean } from "./mod.js";

test(clean.name + " - removes untracked file", async () => {
    await using repo = await tempGitRepo(true);

    const untrackedFile = path.join(repo.path, "untracked.txt");
    await fs.writeFile(untrackedFile, "untracked");

    unwrapOk(await clean(gitCtx, repo.path, []));

    await assert.rejects(fs.access(untrackedFile), "untracked file should be removed");
});

test(clean.name + " - only removes specified paths", async () => {
    await using repo = await tempGitRepo(true);

    const targetFile = path.join(repo.path, "target.txt");
    const otherFile = path.join(repo.path, "other.txt");
    await fs.writeFile(targetFile, "target");
    await fs.writeFile(otherFile, "other");

    unwrapOk(await clean(gitCtx, repo.path, ["target.txt"]));

    await assert.rejects(fs.access(targetFile), "target file should be removed");
    await fs.access(otherFile);
});

test(clean.name + " - directories option recurses into untracked dirs", async () => {
    await using repo = await tempGitRepo(true);

    const nestedDir = path.join(repo.path, "nested");
    await fs.mkdir(nestedDir);
    const nestedFile = path.join(nestedDir, "file.txt");
    await fs.writeFile(nestedFile, "content");

    // Without `-d`, `git clean` won't touch untracked directories.
    unwrapOk(await clean(gitCtx, repo.path, []));
    await fs.access(nestedFile);

    unwrapOk(await clean(gitCtx, repo.path, [], { directories: true }));
    await assert.rejects(fs.access(nestedDir), "nested directory should be removed");
});

test(clean.name + " - leaves tracked files alone", async () => {
    await using repo = await tempGitRepo(true);

    const trackedFile = path.join(repo.path, "tracked.txt");
    await fs.writeFile(trackedFile, "tracked");
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add tracked"]);

    unwrapOk(await clean(gitCtx, repo.path, []));

    await fs.access(trackedFile);
});
