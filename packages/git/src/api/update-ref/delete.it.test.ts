import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { deleteRef } from "./delete.js";

async function resolves(cwd: string, ref: string): Promise<boolean> {
    return isErr(await gitCtx.cli({ cwd }, ["rev-parse", "--verify", "--quiet", ref])) === false;
}

test(deleteRef.name + " - deletes a branch other than the current one", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "side"]);

    unwrapOk(await deleteRef(gitCtx, repo.path, "refs/heads/side"));

    assert.strictEqual(await resolves(repo.path, "refs/heads/side"), false);
    assert.strictEqual(await resolves(repo.path, "HEAD"), true);
});

test(deleteRef.name + " - deleting HEAD deletes the branch it points at and leaves it unborn", async () => {
    await using repo = await tempGitRepo(true);
    await fs.writeFile(path.join(repo.path, "file.txt"), "committed\n");
    await run(repo.path, ["add", "--", "file.txt"]);
    await run(repo.path, ["commit", "-m", "Second"]);
    const branch = await read(repo.path, ["symbolic-ref", "HEAD"]);

    unwrapOk(await deleteRef(gitCtx, repo.path, "HEAD"));

    assert.strictEqual(await read(repo.path, ["symbolic-ref", "HEAD"]), branch);
    assert.strictEqual(await resolves(repo.path, "HEAD"), false);
    assert.strictEqual(await read(repo.path, ["ls-files"]), "file.txt");
});

test(deleteRef.name + " - succeeds when the ref does not exist", async () => {
    await using repo = await tempGitRepo(true);

    unwrapOk(await deleteRef(gitCtx, repo.path, "refs/heads/absent"));

    assert.strictEqual(await resolves(repo.path, "HEAD"), true);
});

test(deleteRef.name + " - fails while another process holds the ref's lock, and keeps the ref", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "side"]);
    await fs.writeFile(path.join(repo.path, ".git", "refs", "heads", "side.lock"), "");

    const result = await deleteRef(gitCtx, repo.path, "refs/heads/side");

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /cannot lock ref 'refs\/heads\/side'/u);
    }
    assert.strictEqual(await resolves(repo.path, "refs/heads/side"), true);
});
