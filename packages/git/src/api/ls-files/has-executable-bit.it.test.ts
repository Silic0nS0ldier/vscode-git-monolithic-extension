import assert from "node:assert";
import test from "node:test";
import { unwrapOk } from "../../errors.js";
import { gitCtx, tempGitRepo, writeExecutableBitFixture } from "../helpers.it.stub.js";
import { hasExecutableBitInIndex } from "./has-executable-bit.js";

test(hasExecutableBitInIndex.name, async () => {
    await using repo = await tempGitRepo(true);

    async function assertHasExecutableBit(filePath: string, expected: boolean | undefined) {
        const hasExecBit = unwrapOk(await hasExecutableBitInIndex(gitCtx, repo.path, filePath));
        assert.strictEqual(hasExecBit, expected, `Expected "${filePath}" to have executable bit: ${expected}`);
    }

    await writeExecutableBitFixture(repo.path);

    // Unstaged
    await assertHasExecutableBit("executable.sh", undefined);
    await assertHasExecutableBit("non_executable.txt", undefined);

    // Stage the files
    await gitCtx.cli({ cwd: repo.path }, ["add", "."]);

    // Staged
    await assertHasExecutableBit("executable.sh", true);
    await assertHasExecutableBit("non_executable.txt", false);

    // Non-existent file
    await assertHasExecutableBit("nonexistent.txt", undefined);
});
