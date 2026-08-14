import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, run, tempGitRepo } from "../helpers.it.stub.js";
import { list } from "./list.js";

test(list.name + " - yields nothing for a clean repository", async () => {
    await using repo = await tempGitRepo(true);

    assert.deepStrictEqual(unwrapOk(await list(gitCtx, repo.path)), []);
});

test(list.name + " - lists stashes newest first", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    // `git stash push` ignores untracked files by default, so there must be a tracked
    // change to stash.
    const file = path.join(repo.path, "file.txt");
    await fs.writeFile(file, "base");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add file"]);

    await fs.writeFile(file, "first");
    await run(repo.path, ["stash", "push", "-m", "First stash"]);

    await fs.writeFile(file, "second");
    await run(repo.path, ["stash", "push", "-m", "Second stash"]);

    assert.deepStrictEqual(unwrapOk(await list(gitCtx, repo.path)), [
        { description: " On main: Second stash", index: 0 },
        { description: " On main: First stash", index: 1 },
    ]);
});
