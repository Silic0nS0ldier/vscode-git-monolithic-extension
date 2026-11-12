import { from_str_radix } from "monolithic-git-wasm";
import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { GitContext } from "../../cli/context.js";
import { fromPath } from "../../cli/from-path.js";
import { unwrapOk } from "../../errors.js";
import { isErr } from "../../func-result.js";
import { gitCtx, run, services, tempGitRepo, writeUntrackedLayout } from "../helpers.it.stub.js";
import { status, type StatusOptions } from "./mod.js";
import { trackedWithBranch } from "./tracked-with-branch.js";
import { untracked } from "./untracked.js";

/** `git status -unormal` for `writeUntrackedLayout`: every folder holding only untracked files is collapsed. */
const COLLAPSED_LAYOUT = [
    "*star/",
    "-dash/",
    ":(icase)magic/",
    ":colon/",
    "A/",
    "[ab]/",
    "ab/",
    "bad/",
    "new/",
    "partial/beside.txt",
    "root.txt",
    "sp ace/",
    "vendor/",
    "ünï/",
].sort();

test(status.name + " - normal - collapses folders holding only untracked files", async () => {
    await using repo = await tempGitRepo();
    await writeUntrackedLayout(repo.path);

    const result = unwrapOk(await status(gitCtx, repo.path, { untracked: "normal" }));

    assert.deepStrictEqual(result.untracked.sort(), COLLAPSED_LAYOUT);
    assert.deepStrictEqual(result.files, []);
    assert.notStrictEqual(result.head.name, undefined);
});

test(status.name + " - normal - expanding the collapsed folders lists what ls-files lists", async () => {
    await using repo = await tempGitRepo();
    const expected = await writeUntrackedLayout(repo.path);
    // The user's environment reaches git, and these make git refuse `--literal-pathspecs`.
    const inheriting: GitContext = unwrapOk(
        await fromPath(
            gitCtx.path,
            { env: { ...process.env, GIT_GLOB_PATHSPECS: "1", GIT_ICASE_PATHSPECS: "1" }, timeout: 5_000 },
            services,
        ),
    );
    assert.ok(
        isErr(await inheriting.cli({ cwd: repo.path }, ["--literal-pathspecs", "ls-files", "--others", "--", "new/"])),
        "the inherited settings should conflict with --literal-pathspecs",
    );

    const { untracked: listed } = unwrapOk(await status(inheriting, repo.path, { untracked: "normal" }));
    const folders = listed.filter(entry => entry.endsWith("/"));
    const expanded = unwrapOk(await untracked(inheriting, repo.path, "relative", { paths: folders }));

    assert.deepStrictEqual([...listed.filter(entry => !entry.endsWith("/")), ...expanded].sort(), expected);
});

test(status.name + " - all - lists what ls-files lists", async () => {
    await using repo = await tempGitRepo();
    const expected = await writeUntrackedLayout(repo.path);

    const result = unwrapOk(await status(gitCtx, repo.path, { untracked: "all" }));

    assert.deepStrictEqual(result.untracked.sort(), expected);
});

/** Checked once, as git waits on the clock between its probes (which also outlasts the usual timeout). */
const untrackedCacheWorks = (async () => {
    await using repo = await tempGitRepo();
    return !isErr(await gitCtx.cli({ cwd: repo.path, timeout: 30_000 }, ["update-index", "--test-untracked-cache"]));
})();

/**
 * A repository using git's untracked cache, with `writeUntrackedLayout` written long enough ago that git can trust
 * folder timestamps against the index's.
 */
async function untrackedCacheRepo(t: TestContext) {
    if (!(await untrackedCacheWorks)) {
        t.skip("the untracked cache does not work in this file system");
        return undefined;
    }
    const repo = await tempGitRepo();
    await writeUntrackedLayout(repo.path);
    await run(repo.path, ["config", "core.untrackedCache", "true"]);
    await delay(1_100);
    return repo;
}

/**
 * Folders `call` opened through git's untracked cache, or undefined when it did not consult the cache. Lets git
 * save the cache to the index, which `GIT_OPTIONAL_LOCKS=0` would prevent.
 */
async function opendirsVia(call: (git: GitContext) => Promise<unknown>): Promise<number | undefined> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-trace"));
    try {
        const trace = path.join(dir, "trace");
        await call({
            ...gitCtx,
            cli: (context, args) =>
                gitCtx.cli({
                    ...context,
                    env: { ...context.env, GIT_OPTIONAL_LOCKS: undefined, GIT_TRACE2_PERF: trace },
                }, args),
        });
        const counts = [...(await fs.readFile(trace, "utf8")).matchAll(/opendir:(\d+)/gu)];
        return counts.length === 0 ? undefined : counts.reduce((sum, [, count]) => sum + from_str_radix(count!, 10), 0);
    } finally {
        await fs.rm(dir, { force: true, recursive: true });
    }
}

for (const options of [{ untracked: "normal" }, { hideUntrackedInSubmodules: true, untracked: "normal" }] as const) {
    test(status.name + ` - ${JSON.stringify(options)} - is served from the untracked cache once warm`, async t => {
        await using repo = await untrackedCacheRepo(t);
        if (repo === undefined) {
            return;
        }
        if (repo === undefined) {
            return;
        }
        const call = (git: GitContext) => status(git, repo.path, options);

        assert.ok((await opendirsVia(call) ?? 0) > 0, "a cold cache should open folders");
        assert.strictEqual(await opendirsVia(call), 0);
    });
}

test(status.name + " - all - only uses the untracked cache when status.showUntrackedFiles is all", async t => {
    await using repo = await untrackedCacheRepo(t);
    if (repo === undefined) {
        return;
    }
    const call = (git: GitContext) => status(git, repo.path, { untracked: "all" });

    assert.strictEqual(await opendirsVia(call), undefined);
    assert.strictEqual(await opendirsVia(call), undefined);

    await run(repo.path, ["config", "status.showUntrackedFiles", "all"]);
    await opendirsVia(call);
    assert.strictEqual(await opendirsVia(call), 0);
});

test(untracked.name + " - never uses the untracked cache", async t => {
    await using repo = await untrackedCacheRepo(t);
    if (repo === undefined) {
        return;
    }
    const call = (git: GitContext) => untracked(git, repo.path, "relative");

    await opendirsVia(call);
    assert.strictEqual(await opendirsVia(call), undefined);
});

/** The test git build cannot locate `submodule`, which is not a builtin, without being told. */
const submoduleEnv = { GIT_EXEC_PATH: path.join(path.dirname(gitCtx.path), "..", "libexec", "git-core") };

/**
 * A superproject with two submodules from one origin: `quiet` holds only an untracked file, while `busy` has also
 * moved to a new commit and staged a change.
 */
async function superprojectWithDirtySubmodules() {
    const origin = await tempGitRepo(true);
    const repo = await tempGitRepo(true);
    const dispose = async () => {
        await repo[Symbol.asyncDispose]();
        await origin[Symbol.asyncDispose]();
    };

    try {
        for (const sub of ["quiet", "busy"]) {
            // `submodule add` clones, and cloning over the file transport is refused by default.
            await run(
                repo.path,
                ["-c", "protocol.file.allow=always", "submodule", "add", origin.path, sub],
                submoduleEnv,
            );
        }
        await run(repo.path, ["commit", "-m", "Add submodules"]);

        const busy = path.join(repo.path, "busy");
        await run(busy, [
            "-c",
            "user.name=Test User",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--allow-empty",
            "-m",
            "Moved",
        ]);
        await fs.writeFile(path.join(busy, "staged.txt"), "staged");
        await run(busy, ["add", "staged.txt"]);
        for (const sub of ["quiet", "busy"]) {
            await fs.writeFile(path.join(repo.path, sub, "untracked.txt"), "untracked");
        }

        return { path: repo.path, [Symbol.asyncDispose]: dispose };
    } catch (error) {
        await dispose();
        throw error;
    }
}

test(
    status.name + " - hiding untracked content in submodules lists tracked changes as untracked: no does",
    async () => {
        await using repo = await superprojectWithDirtySubmodules();

        type Setting = [file: string | undefined, key: string, value: string];
        const values = ["none", "untracked", "dirty", "all"];
        const settings: Setting[] = [
            ...values.map((value): Setting => [undefined, "diff.ignoreSubmodules", value]),
            ...values.map((value): Setting => [undefined, "submodule.quiet.ignore", value]),
            [".gitmodules", "submodule.quiet.ignore", "all"],
        ];

        const compare = async (label: string, hide: boolean) => {
            const expected = unwrapOk(await trackedWithBranch(gitCtx, repo.path)).files;
            const options: StatusOptions = { hideUntrackedInSubmodules: hide, untracked: "normal" };
            assert.deepStrictEqual(unwrapOk(await status(gitCtx, repo.path, options)).files, expected, label);
            return expected;
        };

        // Unhidden, the untracked file alone lists `quiet` as changed, which `untracked: "no"` does not.
        const unhidden = unwrapOk(await status(gitCtx, repo.path, { untracked: "normal" })).files;
        assert.deepStrictEqual(unhidden.map(file => file.path).sort(), ["busy", "quiet"]);
        assert.deepStrictEqual((await compare("no settings", true)).map(file => file.path), ["busy"]);

        for (const [file, key, value] of settings) {
            const scope = file === undefined ? [] : ["--file", file];
            await run(repo.path, ["config", ...scope, key, value]);
            // As the extension decides: only a missing or `none` user default is replaced.
            const hide = key !== "diff.ignoreSubmodules" || value === "none";
            await compare(`${file ?? "config"} ${key}=${value}`, hide);
            await run(repo.path, ["config", ...scope, "--unset", key]);
        }
    },
);

test(status.name + " - optionalLocks: false leaves .git/index untouched even with dirty stat entries", async () => {
    await using repo = await tempGitRepo(true);
    const trackedPath = path.join(repo.path, "tracked.txt");
    const indexPath = path.join(repo.path, ".git", "index");

    await fs.writeFile(trackedPath, "v1\n");
    await run(repo.path, ["add", "tracked.txt"]);
    await run(repo.path, ["commit", "-m", "Add tracked.txt"]);

    const future = new Date(Date.now() + 60_000);
    await fs.utimes(trackedPath, future, future);
    const beforeIno = (await fs.stat(indexPath)).ino;

    const withOptionalLocksEnabled: GitContext = {
        ...gitCtx,
        cli: (context, args) =>
            gitCtx.cli({ ...context, env: { GIT_OPTIONAL_LOCKS: undefined, ...context.env } }, args),
    };

    const lockedResult = unwrapOk(
        await status(withOptionalLocksEnabled, repo.path, { optionalLocks: false, untracked: "normal" }),
    );
    assert.deepStrictEqual(lockedResult.files, []);
    assert.strictEqual((await fs.stat(indexPath)).ino, beforeIno, "optionalLocks: false must not rewrite .git/index");

    unwrapOk(await status(withOptionalLocksEnabled, repo.path, { untracked: "normal" }));
    assert.notStrictEqual((await fs.stat(indexPath)).ino, beforeIno, "default status refreshes dirty stat entries");
});
