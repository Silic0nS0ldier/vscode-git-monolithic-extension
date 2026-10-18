import test from "ava";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { which } from "./which.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "which-"));
    try {
        await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

async function createFile(path: string, mode: number): Promise<void> {
    await writeFile(path, "");
    await chmod(path, mode);
}

// Exercises POSIX permission bits, which Windows does not have.
const posixTest = process.platform === "win32" ? test.skip : test;

posixTest("returns the first executable on the path", async t => {
    await withTempDir(async dir => {
        const first = join(dir, "first");
        const second = join(dir, "second");
        await mkdir(first);
        await mkdir(second);
        await createFile(join(first, "tool"), 0o755);
        await createFile(join(second, "tool"), 0o755);

        t.is(await which("tool", { path: [first, second].join(delimiter) }), join(first, "tool"));
    });
});

posixTest("skips files that are not executable", async t => {
    await withTempDir(async dir => {
        const first = join(dir, "first");
        const second = join(dir, "second");
        await mkdir(first);
        await mkdir(second);
        await createFile(join(first, "tool"), 0o644);
        await createFile(join(second, "tool"), 0o755);

        t.is(await which("tool", { path: [first, second].join(delimiter) }), join(second, "tool"));
    });
});

posixTest("skips directories with the command's name", async t => {
    await withTempDir(async dir => {
        const first = join(dir, "first");
        const second = join(dir, "second");
        await mkdir(join(first, "tool"), { recursive: true });
        await mkdir(second);
        await createFile(join(second, "tool"), 0o755);

        t.is(await which("tool", { path: [first, second].join(delimiter) }), join(second, "tool"));
    });
});

posixTest("accepts quoted path entries", async t => {
    await withTempDir(async dir => {
        await createFile(join(dir, "tool"), 0o755);

        t.is(await which("tool", { path: `"${dir}"` }), join(dir, "tool"));
    });
});

posixTest("returns null when the command is not on the path", async t => {
    await withTempDir(async dir => {
        t.is(await which("tool", { path: [dir, join(dir, "missing")].join(delimiter) }), null);
    });
});
