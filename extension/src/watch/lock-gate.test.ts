import test from "ava";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createLockGate, transientGitLocks } from "./lock-gate.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-lock-gate-"));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { force: true, recursive: true });
    }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error("timed out waiting for lock recall");
        }
        await delay(10);
    }
}

test("Passes events straight through when no lock file exists", async t => {
    await withTempDir(dotGit => {
        const recalled: [string, string][] = [];
        const gate = createLockGate<string>(transientGitLocks(dotGit), [], entries => {
            recalled.push(...entries.entries());
        });
        try {
            t.false(gate.handle("change", "/repo/file.txt", true));
            t.deepEqual(recalled, []);
        } finally {
            gate.dispose();
        }
        return Promise.resolve();
    });
});

test("Flushes remembered working-tree and important events as soon as .git locks clear without needing more events", async t => {
    await withTempDir(async dotGit => {
        const gitignore = "/repo/.gitignore";
        const locks = transientGitLocks(dotGit);
        const indexLock = path.join(dotGit, "index.lock");
        const headLock = path.join(dotGit, "HEAD.lock");
        const recalled: [string, string][] = [];

        await fs.writeFile(indexLock, "");
        await fs.writeFile(headLock, "");

        const gate = createLockGate<string>(locks, [gitignore], entries => {
            recalled.push(...entries.entries());
        });
        try {
            // Non-watchable directory events do not occupy the first-event slot.
            t.true(gate.handle("addDir", "/repo/sub", false));
            t.true(gate.handle("change", "/repo/first.txt", true));
            t.true(gate.handle("change", "/repo/other.txt", true));
            t.true(gate.handle("change", gitignore, true));
            t.deepEqual(recalled, []);

            // Removing only one of the two locks keeps events held.
            await fs.unlink(indexLock);
            await delay(50);
            t.deepEqual(recalled, []);

            // Removing the remaining lock flushes automatically via the .git release watcher.
            await fs.unlink(headLock);
            await waitFor(() => recalled.length > 0);
            t.deepEqual(recalled, [
                ["/repo/first.txt", "change"],
                [gitignore, "change"],
            ]);
        } finally {
            gate.dispose();
        }
    });
});

test("Disposing while locked drops remembered events and stops watching", async t => {
    await withTempDir(async dotGit => {
        const indexLock = path.join(dotGit, "index.lock");
        await fs.writeFile(indexLock, "");

        const recalled: [string, string][] = [];
        const gate = createLockGate<string>(transientGitLocks(dotGit), [], entries => {
            recalled.push(...entries.entries());
        });

        t.true(gate.handle("change", "/repo/file.txt", true));
        gate.dispose();

        await fs.unlink(indexLock);
        await delay(50);
        t.deepEqual(recalled, []);
    });
});
