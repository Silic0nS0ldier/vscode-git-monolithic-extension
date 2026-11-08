import test from "ava";
import { GitErrorCodes } from "../api/git.js";
import { GitError } from "./error.js";
import { readSubmoduleCommit } from "./submodule-content.js";

test("Submodule content displays the recorded commit", async t => {
    const bytes = await readSubmoduleCommit(async () => ({ object: "a".repeat(40) }));
    t.is(new TextDecoder().decode(bytes), `Subproject commit ${"a".repeat(40)}\n`);
});

test("A missing submodule path has empty content", async t => {
    const missing = new GitError({ gitErrorCode: GitErrorCodes.UnknownPath });
    t.deepEqual(
        await readSubmoduleCommit(async () => {
            throw missing;
        }),
        new Uint8Array(),
    );
});

test("Submodule content propagates unexpected Git and non-Git failures", async t => {
    for (const failure of [new GitError({ gitErrorCode: GitErrorCodes.NotAGitRepository }), new Error("failed")]) {
        await t.throwsAsync(
            readSubmoduleCommit(async () => {
                throw failure;
            }),
            { is: failure },
        );
    }
});
