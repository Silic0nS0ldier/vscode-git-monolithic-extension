import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { size } from "./size.js";

test(size.name + " - blob staged in the index", async () => {
    await using repo = await tempGitRepo(true);

    const content = "hello\n";
    await fs.writeFile(path.join(repo.path, "hello.txt"), content);
    await run(repo.path, ["add", "."]);

    const object = await read(repo.path, ["rev-parse", ":hello.txt"]);

    assert.strictEqual(unwrapOk(await size(gitCtx, repo.path, object)), Buffer.byteLength(content));
});

test(size.name + " - accepts a revision path rather than an object name", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "hello.txt"), "hello\n");
    await run(repo.path, ["add", "."]);
    await run(repo.path, ["commit", "-m", "Add hello.txt"]);

    assert.strictEqual(unwrapOk(await size(gitCtx, repo.path, "HEAD:hello.txt")), 6);
});

test(size.name + " - empty blob", async () => {
    await using repo = await tempGitRepo(true);

    await fs.writeFile(path.join(repo.path, "empty.txt"), "");
    await run(repo.path, ["add", "."]);

    assert.strictEqual(unwrapOk(await size(gitCtx, repo.path, ":empty.txt")), 0);
});

test(size.name + " - unknown object", async () => {
    await using repo = await tempGitRepo(true);

    const result = await size(gitCtx, repo.path, "HEAD:nope.txt");

    assert.ok(isErr(result));
    assert.strictEqual(unwrap(result).type, ERROR_NON_ZERO_EXIT);
});
