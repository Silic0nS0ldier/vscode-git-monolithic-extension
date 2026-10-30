import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { newBranch } from "./new-branch.js";

async function head(cwd: string): Promise<string> {
    return (await read(cwd, ["symbolic-ref", "HEAD"])).trim();
}

async function revParse(cwd: string, rev: string): Promise<string> {
    return (await read(cwd, ["rev-parse", rev])).trim();
}

/** A repository whose remote-tracking `origin/feature` is one commit ahead of `HEAD`. */
async function repoWithRemoteBranch() {
    const repo = await tempGitRepo(true);
    await run(repo.path, ["config", "remote.origin.url", "/nonexistent"]);
    await run(repo.path, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Feature"]);
    await run(repo.path, ["update-ref", "refs/remotes/origin/feature", "HEAD"]);
    await run(repo.path, ["reset", "--hard", "HEAD~1"]);
    return repo;
}

function assertRefusal(result: Awaited<ReturnType<typeof newBranch>>, exitCode: number, stderr: RegExp): void {
    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.strictEqual(error.cause.exitCode, exitCode);
        assert.match(error.cause.stderr, stderr);
    }
}

test(newBranch.name + " - switches to a new branch at HEAD, keeping local changes", async () => {
    await using repo = await tempGitRepo(true);
    const before = await revParse(repo.path, "HEAD");
    await fs.writeFile(path.join(repo.path, "local.txt"), "local\n");

    unwrapOk(await newBranch(gitCtx, repo.path, "topic"));

    assert.strictEqual(await head(repo.path), "refs/heads/topic");
    assert.strictEqual(await revParse(repo.path, "topic"), before);
    assert.strictEqual(await fs.readFile(path.join(repo.path, "local.txt"), "utf8"), "local\n");
});

test(newBranch.name + " - tracks a remote branch start point by default", async () => {
    await using repo = await repoWithRemoteBranch();

    unwrapOk(await newBranch(gitCtx, repo.path, "topic", { startPoint: "origin/feature" }));

    assert.strictEqual(await head(repo.path), "refs/heads/topic");
    assert.strictEqual((await read(repo.path, ["config", "branch.topic.remote"])).trim(), "origin");
});

test(newBranch.name + " - does not track a remote branch start point with noTrack", async () => {
    await using repo = await repoWithRemoteBranch();

    unwrapOk(await newBranch(gitCtx, repo.path, "topic", { noTrack: true, startPoint: "origin/feature" }));

    assert.strictEqual(await head(repo.path), "refs/heads/topic");
    assert.strictEqual(await revParse(repo.path, "topic"), await revParse(repo.path, "origin/feature"));
    await assert.rejects(read(repo.path, ["config", "branch.topic.remote"]));
});

test(newBranch.name + " - refuses a name that is taken and stays put", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "taken"]);
    const before = await head(repo.path);

    const result = await newBranch(gitCtx, repo.path, "taken");

    assertRefusal(result, 128, /^fatal: a branch named 'taken' already exists$/imu);
    assert.strictEqual(await head(repo.path), before);
});

test(newBranch.name + " - refuses an invalid name", async () => {
    await using repo = await tempGitRepo(true);

    const result = await newBranch(gitCtx, repo.path, "bad..name");

    assertRefusal(result, 128, /'bad\.\.name' is not a valid branch name/u);
});

test(newBranch.name + " - fails on a start point that does not exist and stays put", async () => {
    await using repo = await tempGitRepo(true);
    const before = await head(repo.path);

    const result = await newBranch(gitCtx, repo.path, "topic", { startPoint: "absent" });

    assertRefusal(result, 128, /absent/u);
    assert.strictEqual(await head(repo.path), before);
});

test(newBranch.name + " - switches an unborn HEAD to a new unborn branch", async () => {
    await using repo = await tempGitRepo();

    unwrapOk(await newBranch(gitCtx, repo.path, "topic"));

    assert.strictEqual(await head(repo.path), "refs/heads/topic");
});
