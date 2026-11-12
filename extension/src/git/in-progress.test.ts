import test from "ava";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hasInProgressOperation } from "./in-progress.js";

async function withTempDotGit(fn: (dotGit: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-in-progress-"));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { force: true, recursive: true });
    }
}

test("Reports false for an ordinary .git directory or a missing one", async t => {
    await withTempDotGit(async dotGit => {
        await fs.writeFile(path.join(dotGit, "HEAD"), "ref: refs/heads/main\n");
        await fs.writeFile(path.join(dotGit, "index"), "");
        await fs.writeFile(path.join(dotGit, "COMMIT_EDITMSG"), "");
        t.false(await hasInProgressOperation(dotGit));
        t.false(await hasInProgressOperation(path.join(dotGit, "absent")));
    });
});

test("Reports true for each lock and multi-step operation marker", async t => {
    for (
        const marker of [
            "index.lock",
            "HEAD.lock",
            "MERGE_HEAD",
            "CHERRY_PICK_HEAD",
            "REVERT_HEAD",
            "BISECT_LOG",
        ]
    ) {
        await withTempDotGit(async dotGit => {
            const target = path.join(dotGit, marker);
            await fs.writeFile(target, "");
            t.true(await hasInProgressOperation(dotGit), marker);
            await fs.rm(target);
            t.false(await hasInProgressOperation(dotGit), `${marker} cleared`);
        });
    }

    for (const dirMarker of ["rebase-merge", "rebase-apply"]) {
        await withTempDotGit(async dotGit => {
            const target = path.join(dotGit, dirMarker);
            await fs.mkdir(target);
            t.true(await hasInProgressOperation(dotGit), dirMarker);
            await fs.rm(target, { recursive: true });
            t.false(await hasInProgressOperation(dotGit), `${dirMarker} cleared`);
        });
    }
});
