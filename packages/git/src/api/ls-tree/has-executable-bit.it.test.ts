import assert from "node:assert";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, tempGitRepo, writeExecutableBitFixture } from "../helpers.it.stub.js";
import { hasExecutableBit } from "./has-executable-bit.js";

test(hasExecutableBit.name, async () => {
    await using repo = await tempGitRepo(true);

    async function assertHasExecutableBit(filePath: string, commit_ish: string, expected: boolean | undefined) {
        const hasExecBit = unwrapOk(await hasExecutableBit(gitCtx, repo.path, filePath, commit_ish));
        assert.strictEqual(hasExecBit, expected, `Expected "${filePath}" to have executable bit: ${expected}`);
    }

    await writeExecutableBitFixture(repo.path);

    // Untracked
    await assertHasExecutableBit("executable.sh", "HEAD", undefined);
    await assertHasExecutableBit("non_executable.txt", "HEAD", undefined);

    // Commit the files
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);
    await gitCtx.cli({ cwd: repo.path }, ["commit", "-m", "Add files"]);

    // Tracked
    await assertHasExecutableBit("executable.sh", "HEAD", true);
    await assertHasExecutableBit("non_executable.txt", "HEAD", false);

    // Non-existent file
    await assertHasExecutableBit("nonexistent.txt", "HEAD", undefined);
});
