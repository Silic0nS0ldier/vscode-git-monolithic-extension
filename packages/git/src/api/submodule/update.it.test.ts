import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { update } from "./update.js";

/** The test git build cannot locate `submodule`, which is not a builtin, without being told. */
const env = { GIT_EXEC_PATH: path.join(path.dirname(gitCtx.path), "..", "libexec", "git-core") };

/**
 * A superproject with submodules at `paths`, each recording the first of two commits in a shared
 * origin while its work tree is checked out at the second.
 */
async function superprojectWithMovedSubmodules(...paths: string[]) {
    const origin = await tempGitRepo();
    const repo = await tempGitRepo(true);
    const dispose = async () => {
        await repo[Symbol.asyncDispose]();
        await origin[Symbol.asyncDispose]();
    };

    try {
        for (const revision of ["first", "second"]) {
            await fs.writeFile(path.join(origin.path, "revision.txt"), `${revision}\n`);
            await run(origin.path, ["add", "revision.txt"]);
            await run(origin.path, ["commit", "-m", revision]);
        }
        const recorded = await read(origin.path, ["rev-parse", "HEAD~1"]);
        const moved = await read(origin.path, ["rev-parse", "HEAD"]);

        for (const sub of paths) {
            // `submodule add` clones, and cloning over the file transport is refused by default.
            await run(repo.path, ["-c", "protocol.file.allow=always", "submodule", "add", origin.path, sub], env);
            await run(path.join(repo.path, sub), ["checkout", "--quiet", recorded]);
            await run(repo.path, ["add", sub]);
        }
        await run(repo.path, ["commit", "-m", "Add submodules"]);
        for (const sub of paths) {
            await run(path.join(repo.path, sub), ["checkout", "--quiet", moved]);
        }

        return { moved, path: repo.path, recorded, [Symbol.asyncDispose]: dispose };
    } catch (error) {
        await dispose();
        throw error;
    }
}

function head(cwd: string): Promise<string> {
    return read(cwd, ["rev-parse", "HEAD"]);
}

test(update.name + " - checks out the recorded commit of only the given submodules", async () => {
    await using repo = await superprojectWithMovedSubmodules("sub", "libs/other", "untouched");

    unwrapOk(await update(gitCtx, repo.path, ["sub", path.join(repo.path, "libs", "other")], { env }));

    assert.strictEqual(await head(path.join(repo.path, "sub")), repo.recorded);
    assert.strictEqual(await head(path.join(repo.path, "libs", "other")), repo.recorded);
    assert.strictEqual(await head(path.join(repo.path, "untouched")), repo.moved);
});

test(update.name + " - updates nothing when given no paths", async () => {
    await using repo = await superprojectWithMovedSubmodules("sub");

    unwrapOk(await update(gitCtx, repo.path, [], { env }));

    assert.strictEqual(await head(path.join(repo.path, "sub")), repo.moved);
});

test(update.name + " - fails on a path that is not a submodule", async () => {
    await using repo = await tempGitRepo(true);

    const result = await update(gitCtx, repo.path, ["absent"], { env });

    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.match(error.cause.stderr, /pathspec 'absent' did not match any file\(s\) known to git/u);
    }
});
