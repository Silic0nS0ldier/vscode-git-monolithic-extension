import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo, tempOrigin } from "../helpers.it.stub.js";
import { cherry } from "./cherry.js";

async function commit(repo: string, content: string, message: string): Promise<void> {
    await fs.writeFile(path.join(repo, "file.txt"), content);
    await run(repo, ["add", "."]);
    await run(repo, ["commit", "-m", message]);
}

test(cherry.name + " - marks a rebased-and-repushed commit as equivalent", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "base", "Base");
    await using _origin = await tempOrigin(repo.path);

    await commit(repo.path, "local", "Local pending change");

    // Same tree as the local-only commit, off the same base, the way a rebase would produce.
    const equivalent = await read(repo.path, ["commit-tree", "HEAD^{tree}", "-p", "HEAD^", "-m", "Equivalent change"]);
    await run(repo.path, ["push", "origin", `${equivalent}:refs/heads/main`]);
    await run(repo.path, ["fetch", "origin"]);

    const [cherryEntry, ...extras] = unwrapOk(await cherry(gitCtx, repo.path, "main...main@{upstream}"));

    assert.strictEqual(extras.length, 0);
    assert.ok(cherryEntry != null);
    assert.strictEqual(cherryEntry.status, "equivalent");
    assert.strictEqual(cherryEntry.hash, equivalent.slice(0, cherryEntry.hash.length));
});

test(cherry.name + " - marks a commit with no equivalent as unique", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "base", "Base");
    await using _origin = await tempOrigin(repo.path);

    // Pushed straight from local, so it has no local-only counterpart to be equivalent to.
    await commit(repo.path, "upstream-only", "Upstream-only change");
    await run(repo.path, ["push", "origin", "main"]);
    await run(repo.path, ["reset", "--hard", "HEAD~1"]);
    await run(repo.path, ["fetch", "origin"]);

    const [cherryEntry, ...extras] = unwrapOk(await cherry(gitCtx, repo.path, "main...main@{upstream}"));

    assert.strictEqual(extras.length, 0);
    assert.ok(cherryEntry != null);
    assert.strictEqual(cherryEntry.status, "unique");
});

test(cherry.name + " - yields nothing when nothing diverges", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);
    await commit(repo.path, "base", "Base");

    assert.deepStrictEqual(unwrapOk(await cherry(gitCtx, repo.path, "main...main")), []);
});

test(cherry.name + " - fails when the range has no upstream", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);
    await commit(repo.path, "base", "Base");

    assert.ok(isErr(await cherry(gitCtx, repo.path, "main...main@{upstream}")));
});
