import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, read, tempGitRepo } from "../helpers.it.stub.js";
import { write } from "./write.js";

test(write.name + " - sets a key in the repository's own config", async () => {
    await using repo = await tempGitRepo();

    unwrapOk(await write(gitCtx, repo.path, "local", "user.name", "Someone Else"));

    assert.strictEqual((await read(repo.path, ["config", "--local", "--get", "user.name"])).trim(), "Someone Else");
});

test(write.name + " - sets a key in the user's config, leaving the repository's alone", async () => {
    await using repo = await tempGitRepo();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test-global"));
    try {
        const env = { GIT_CONFIG_GLOBAL: path.join(dir, "gitconfig") };

        unwrapOk(await write(gitCtx, repo.path, "global", "user.email", "someone@example.com", { env }));

        assert.match(await fs.readFile(env.GIT_CONFIG_GLOBAL, "utf8"), /email = someone@example\.com/);
        assert.strictEqual(
            (await read(repo.path, ["config", "--local", "--get", "user.email"])).trim(),
            "test@example.com",
        );
    } finally {
        await fs.rm(dir, { force: true, recursive: true });
    }
});
