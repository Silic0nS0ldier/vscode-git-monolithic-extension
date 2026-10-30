import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { create } from "./create.js";

async function revParse(cwd: string, rev: string): Promise<string> {
    return (await read(cwd, ["rev-parse", rev])).trim();
}

function assertRefusal(result: Awaited<ReturnType<typeof create>>, exitCode: number, stderr: RegExp): void {
    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.strictEqual(error.cause.exitCode, exitCode);
        assert.match(error.cause.stderr, stderr);
    }
}

test(create.name + " - creates a branch at HEAD without switching to it or touching the work tree", async () => {
    await using repo = await tempGitRepo(true);
    await fs.writeFile(path.join(repo.path, "local.txt"), "local\n");
    const before = await read(repo.path, ["symbolic-ref", "HEAD"]);

    unwrapOk(await create(gitCtx, repo.path, "topic"));

    assert.strictEqual(await read(repo.path, ["symbolic-ref", "HEAD"]), before);
    assert.strictEqual(await revParse(repo.path, "topic"), await revParse(repo.path, "HEAD"));
    assert.strictEqual(await fs.readFile(path.join(repo.path, "local.txt"), "utf8"), "local\n");
});

test(create.name + " - creates a branch at the given start point, tracking a remote branch by default", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["config", "remote.origin.url", "/nonexistent"]);
    await run(repo.path, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
    await run(repo.path, ["update-ref", "refs/remotes/origin/feature", "HEAD"]);

    unwrapOk(await create(gitCtx, repo.path, "topic", { startPoint: "origin/feature" }));

    assert.strictEqual(await revParse(repo.path, "topic"), await revParse(repo.path, "origin/feature"));
    assert.strictEqual((await read(repo.path, ["config", "branch.topic.remote"])).trim(), "origin");
});

test(create.name + " - refuses a name that is taken and leaves that branch alone", async () => {
    await using repo = await tempGitRepo(true);
    await run(repo.path, ["branch", "taken"]);
    await run(repo.path, ["commit", "--allow-empty", "-m", "Later"]);
    const before = await revParse(repo.path, "taken");

    const result = await create(gitCtx, repo.path, "taken");

    assertRefusal(result, 128, /^fatal: a branch named 'taken' already exists$/imu);
    assert.strictEqual(await revParse(repo.path, "taken"), before);
});

test(create.name + " - refuses an invalid name", async () => {
    await using repo = await tempGitRepo(true);

    const result = await create(gitCtx, repo.path, "bad..name");

    assertRefusal(result, 128, /'bad\.\.name' is not a valid branch name/u);
});

test(create.name + " - fails on a start point that does not exist", async () => {
    await using repo = await tempGitRepo(true);

    const result = await create(gitCtx, repo.path, "topic", { startPoint: "absent" });

    assertRefusal(result, 128, /^fatal: not a valid object name: 'absent'/imu);
});

test(create.name + " - fails on an unborn HEAD", async () => {
    await using repo = await tempGitRepo();

    const result = await create(gitCtx, repo.path, "topic");

    assertRefusal(result, 128, /^fatal: /mu);
});

// Pins the missing `--end-of-options` (see the TODO in `create.ts`).
test(create.name + " - reads a name that starts with a dash as an option", async () => {
    await using repo = await tempGitRepo(true);

    const result = await create(gitCtx, repo.path, "-x");

    assertRefusal(result, 129, /unknown switch `x'/u);
});
