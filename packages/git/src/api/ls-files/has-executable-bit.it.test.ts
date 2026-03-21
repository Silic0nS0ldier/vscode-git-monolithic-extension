import test from "node:test";
import assert from "node:assert";
import { isErr, unwrap } from "../../func-result.js";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { hasExecutableBitInIndex } from "./has-executable-bit.js";
import path from "node:path";
import fs from "node:fs/promises";

test(hasExecutableBitInIndex.name, async () => {
    await using repo = await tempGitRepo(true);
    
    async function assertHasExecutableBit(filePath: string, expected: boolean | undefined) {
        const result = await hasExecutableBitInIndex(gitCtx, repo.path, filePath);
        if (isErr(result)) {
            throw unwrap(result);
        }
        const hasExecBit = unwrap(result);
        assert.strictEqual(hasExecBit, expected, `Expected "${filePath}" to have executable bit: ${expected}`);
    }

    // Create a file with executable permissions
    const filePath = path.join(repo.path, "executable.sh");
    await fs.writeFile(filePath, "#!/bin/bash\necho Hello");
    await fs.chmod(filePath, 0o755); // rwxr-xr-x

    // Create a file without executable permissions
    const nonExecFilePath = path.join(repo.path, "non_executable.txt");
    await fs.writeFile(nonExecFilePath, "This is a non-executable file.");
    await fs.chmod(nonExecFilePath, 0o644); // rw-r--r--

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
