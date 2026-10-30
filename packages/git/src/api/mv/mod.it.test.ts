import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ERROR_NON_ZERO_EXIT, unwrapOk } from "../../errors.js";
import { isErr, unwrap } from "../../func-result.js";
import { gitCtx, read, run, tempGitRepo } from "../helpers.it.stub.js";
import { mv } from "./mod.js";

/** Path to its two-letter porcelain status code, e.g. `a.txt -> b.txt` -> `R ` (staged rename). */
async function status(cwd: string): Promise<Record<string, string>> {
    const stdout = await read(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

async function repoWithFiles(...names: string[]) {
    const repo = await tempGitRepo(true);

    for (const name of names) {
        await fs.mkdir(path.dirname(path.join(repo.path, name)), { recursive: true });
        await fs.writeFile(path.join(repo.path, name), `${name}\n`);
    }
    await run(repo.path, ["add", "--", ...names]);
    await run(repo.path, ["commit", "-m", "Add files"]);

    return repo;
}

function assertRefusal(result: Awaited<ReturnType<typeof mv>>, exitCode: number, stderr: RegExp): void {
    assert.ok(isErr(result));
    const error = unwrap(result);
    assert.strictEqual(error.type, ERROR_NON_ZERO_EXIT);
    if (error.type === ERROR_NON_ZERO_EXIT) {
        assert.strictEqual(error.cause.exitCode, exitCode);
        assert.match(error.cause.stderr, stderr);
    }
}

test(mv.name + " - renames a tracked file and stages the rename", async () => {
    await using repo = await repoWithFiles("from.txt");

    unwrapOk(await mv(gitCtx, repo.path, "from.txt", "to.txt"));

    assert.deepStrictEqual(await status(repo.path), { "from.txt -> to.txt": "R " });
    await assert.rejects(fs.access(path.join(repo.path, "from.txt")), { code: "ENOENT" });
    assert.strictEqual(await fs.readFile(path.join(repo.path, "to.txt"), "utf8"), "from.txt\n");
});

test(mv.name + " - moves a file between directories by paths relative to the repository", async () => {
    await using repo = await repoWithFiles("nested/from.txt");
    await fs.mkdir(path.join(repo.path, "other"));

    unwrapOk(await mv(gitCtx, repo.path, "nested/from.txt", "other/to.txt"));

    assert.deepStrictEqual(await status(repo.path), { "nested/from.txt -> other/to.txt": "R " });
});

test(mv.name + " - moves a file into an existing directory", async () => {
    await using repo = await repoWithFiles("from.txt", "dir/kept.txt");

    unwrapOk(await mv(gitCtx, repo.path, "from.txt", "dir"));

    assert.deepStrictEqual(await status(repo.path), { "from.txt -> dir/from.txt": "R " });
});

test(mv.name + " - refuses to overwrite an existing file and moves nothing", async () => {
    await using repo = await repoWithFiles("from.txt", "to.txt");

    const result = await mv(gitCtx, repo.path, "from.txt", "to.txt");

    assertRefusal(result, 128, /^fatal: destination exists, source=from\.txt, destination=to\.txt$/mu);
    assert.deepStrictEqual(await status(repo.path), {});
});

test(mv.name + " - refuses an untracked source and moves nothing", async () => {
    await using repo = await tempGitRepo(true);
    await fs.writeFile(path.join(repo.path, "untracked.txt"), "untracked\n");

    const result = await mv(gitCtx, repo.path, "untracked.txt", "to.txt");

    assertRefusal(result, 128, /^fatal: not under version control, source=untracked\.txt, destination=to\.txt$/mu);
    assert.deepStrictEqual(await status(repo.path), { "untracked.txt": "??" });
});

test(mv.name + " - fails on a source that does not exist", async () => {
    await using repo = await tempGitRepo(true);

    const result = await mv(gitCtx, repo.path, "absent.txt", "to.txt");

    assertRefusal(result, 128, /^fatal: bad source, source=absent\.txt, destination=to\.txt$/mu);
});

// Pins the missing `--` (see the TODO in `mod.ts`).
test(mv.name + " - reads a source that starts with a dash as an option", async () => {
    await using repo = await repoWithFiles("-n");

    const result = await mv(gitCtx, repo.path, "-n", "to.txt");

    assertRefusal(result, 129, /^usage: git mv /mu);
    assert.deepStrictEqual(await status(repo.path), {});
});
