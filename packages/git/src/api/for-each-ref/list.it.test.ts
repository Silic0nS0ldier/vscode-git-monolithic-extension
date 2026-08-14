import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { list } from "./list.js";

/** Keeps `--sort=-committerdate` deterministic; commits made in one test share a second. */
function at(seconds: number): Record<string, string> {
    const date = `@${seconds} +0000`;
    return { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
}

async function commit(repo: string, message: string, when?: Record<string, string>): Promise<string> {
    await fs.writeFile(path.join(repo, "file.txt"), message);
    await run(repo, ["add", "."]);
    await run(repo, ["commit", "-m", message], when);
    return await read(repo, ["rev-parse", "HEAD"]);
}

test(list.name + " - lists branches, remote branches and tags", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    const base = await commit(repo.path, "Base");
    await run(repo.path, ["branch", "feature"]);
    await run(repo.path, ["tag", "v1.0.0"]);
    // A remote-tracking ref without a remote, which is all `for-each-ref` reads.
    await run(repo.path, ["update-ref", "refs/remotes/origin/main", base]);

    const refs = unwrapOk(await list(gitCtx, repo.path));

    assert.deepStrictEqual(refs, [
        { commit: base, kind: "head", name: "feature" },
        { commit: base, kind: "head", name: "main" },
        { commit: base, kind: "remote-head", name: "origin/main", remote: "origin" },
        { commit: base, kind: "tag", name: "v1.0.0" },
    ]);
});

test(list.name + " - reports the commit an annotated tag points at", async () => {
    await using repo = await tempGitRepo(true);

    const base = await commit(repo.path, "Base");
    await run(repo.path, ["tag", "--annotate", "v2.0.0", "-m", "Second release"]);

    const [tag] = unwrapOk(await list(gitCtx, repo.path, { pattern: "refs/tags" }));

    assert.strictEqual(tag.kind, "tag");
    assert.strictEqual(tag.commit, base, "the tag object should be dereferenced to its commit");
});

test(list.name + " - narrows to a pattern", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "Base");
    await run(repo.path, ["branch", "feature"]);
    await run(repo.path, ["tag", "v1.0.0"]);

    const refs = unwrapOk(await list(gitCtx, repo.path, { pattern: "refs/heads" }));

    assert.deepStrictEqual(refs.map(ref => ref.name), ["feature", "main"]);
});

test(list.name + " - sorts by committer date, newest first", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "Base", at(1_000_000_000));
    await run(repo.path, ["checkout", "-b", "older"]);
    await commit(repo.path, "Older", at(1_000_000_100));
    await run(repo.path, ["checkout", "-b", "newer"]);
    await commit(repo.path, "Newer", at(1_000_000_200));

    const refs = unwrapOk(await list(gitCtx, repo.path, { pattern: "refs/heads", sort: "committerdate" }));

    assert.deepStrictEqual(refs.map(ref => ref.name), ["newer", "older", "main"]);
});

test(list.name + " - limits the count", async () => {
    await using repo = await tempGitRepo(true);

    await commit(repo.path, "Base");
    await run(repo.path, ["branch", "a"]);
    await run(repo.path, ["branch", "b"]);

    const refs = unwrapOk(await list(gitCtx, repo.path, { count: 2, pattern: "refs/heads" }));

    assert.strictEqual(refs.length, 2);
});

test(list.name + " - keeps only refs containing a commit", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "-M", "main"]);

    await commit(repo.path, "Base");
    await run(repo.path, ["branch", "stale"]);
    const tip = await commit(repo.path, "Tip");

    const refs = unwrapOk(await list(gitCtx, repo.path, { contains: tip, pattern: "refs/heads" }));

    assert.deepStrictEqual(refs.map(ref => ref.name), ["main"]);
});
