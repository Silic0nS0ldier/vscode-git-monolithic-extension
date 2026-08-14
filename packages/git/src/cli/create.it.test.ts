import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gitCtx, tempGitRepo } from "../api/helpers.it.stub.js";
import { ERROR_NON_ZERO_EXIT } from "../errors.js";
import { isErr, unwrap } from "../func-result.js";

async function run(cwd: string, args: string[]): Promise<void> {
    const result = await gitCtx.cli({ cwd }, args);
    if (isErr(result)) {
        throw unwrap(result)._error;
    }
}

async function failure(cwd: string, args: string[]) {
    const result = await gitCtx.cli({ cwd }, args);
    assert.ok(isErr(result), `expected \`git ${args.join(" ")}\` to fail`);

    const error = unwrap(result);
    if (error.type !== ERROR_NON_ZERO_EXIT) {
        assert.fail(`expected a non-zero exit, got ${String(error.type)}`);
    }

    return error.cause;
}

test("non-zero exit reports git's message from stderr", async () => {
    await using repo = await tempGitRepo(true);

    const details = await failure(repo.path, ["checkout", "does-not-exist"]);

    assert.strictEqual(details.exitCode, 1);
    assert.strictEqual(details.signal, null);
    assert.deepStrictEqual(details.args, ["checkout", "does-not-exist"]);
    assert.strictEqual(details.cwd, repo.path);
    assert.match(details.stderr, /did not match any file\(s\) known to git/u);
});

test("non-zero exit reports conflicts from stdout", async () => {
    await using repo = await tempGitRepo(true);
    const file = path.join(repo.path, "conflict.txt");

    await fs.writeFile(file, "base");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Base"]);

    await run(repo.path, ["checkout", "-b", "other"]);
    await fs.writeFile(file, "other");
    await run(repo.path, ["commit", "-am", "Other"]);

    await run(repo.path, ["checkout", "-"]);
    await fs.writeFile(file, "mine");
    await run(repo.path, ["commit", "-am", "Mine"]);

    const details = await failure(repo.path, ["merge", "other"]);

    // git reports the conflict on stdout and says nothing useful on stderr, which is why
    // both streams are captured.
    assert.strictEqual(details.exitCode, 1);
    assert.match(details.stdout, /^CONFLICT \([^)]+\): /mu);
});
