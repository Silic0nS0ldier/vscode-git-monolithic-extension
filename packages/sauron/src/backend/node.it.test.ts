import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it, type TestContext } from "node:test";
import { inspect } from "node:util";
import { type AbsolutePath, absolutePath, type FileName } from "../path.js";
import { listenSocket, mkfifo, mknod } from "../special-files.it.stub.js";
import { createNodeBackend } from "./node.js";

const backend = createNodeBackend();
const signal = new AbortController().signal;
/** Generous, as a regression blocks forever. */
const TIMEOUT = { timeout: 5_000 };

let root: string;
let server: net.Server | null = null;
/** Names created in `root`, with why any could not be. */
const unsupported = new Map<string, string>();

function absolute(raw: string): AbsolutePath {
    const result = absolutePath(raw);
    assert.ok(!isErr(result));
    return unwrap(result);
}

function abs(...segments: string[]): AbsolutePath {
    return absolute(path.join(root, ...segments));
}

function skipIfUnsupported(t: TestContext, name: string): boolean {
    const reason = unsupported.get(name);
    if (reason !== undefined) {
        t.skip(reason);
    }
    return reason !== undefined;
}

async function readText(target: AbsolutePath): Promise<string | null> {
    const result = await backend.readText(target, signal);
    assert.ok(!isErr(result), "readText failed");
    return unwrap(result);
}

async function stat(target: AbsolutePath): Promise<string | null> {
    const result = await backend.stat(target, signal);
    assert.ok(!isErr(result), "stat failed");
    return unwrap(result)?.kind ?? null;
}

describe("node backend", { skip: process.platform === "linux" ? false : "needs Linux file system semantics" }, () => {
    before(async () => {
        root = await fs.realpath(await fs.mkdtemp(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "backend-")));
        await fs.writeFile(path.join(root, "file"), "content");
        await fs.mkdir(path.join(root, "dir"));
        await fs.symlink("file", path.join(root, "symlink"));
        await fs.symlink("dir", path.join(root, "dir-symlink"));
        await fs.symlink("missing", path.join(root, "dangling"));
        await fs.symlink("loop", path.join(root, "loop"));
        await fs.link(path.join(root, "file"), path.join(root, "hardlink"));
        server = await listenSocket(path.join(root, "socket"));
        const created: [string, string | null][] = [
            ["fifo", mkfifo(path.join(root, "fifo"))],
            ["character-device", mknod(path.join(root, "character-device"), "character", 0, 0)],
            ["block-device", mknod(path.join(root, "block-device"), "block", 7, 0)],
        ];
        for (const [name, reason] of created) {
            if (reason !== null) {
                unsupported.set(name, reason);
            }
        }
    });

    after(async () => {
        await new Promise(resolve => server?.close(resolve));
        await fs.rm(root, { recursive: true, force: true });
    });

    it("readdir reports the kind of every entry without following symlinks", TIMEOUT, async () => {
        const result = await backend.readdir(abs(), signal);
        if (isErr(result)) {
            assert.fail(inspect(unwrap(result)));
        }
        const expected: Record<string, string> = {
            file: "file",
            hardlink: "file",
            dir: "directory",
            symlink: "symlink",
            "dir-symlink": "symlink",
            dangling: "symlink",
            loop: "symlink",
            socket: "other",
            fifo: "other",
            "character-device": "other",
            "block-device": "other",
        };
        for (const name of unsupported.keys()) {
            delete expected[name];
        }
        assert.deepEqual(Object.fromEntries(unwrap(result)), expected);
    });

    it("stat follows symlinks, and treats dangling ones and loops as missing", TIMEOUT, async () => {
        assert.equal(await stat(abs("symlink")), "file");
        assert.equal(await stat(abs("dir-symlink")), "directory");
        assert.equal(await stat(abs("dangling")), null);
        assert.equal(await stat(abs("loop")), null);
        assert.equal(await stat(abs("socket")), "other");
    });

    it("lstat reports symlinks as such, dangling or looping", TIMEOUT, async () => {
        for (const name of ["symlink", "dir-symlink", "dangling", "loop"]) {
            const result = await backend.lstat(abs(name), signal);
            assert.ok(!isErr(result));
            assert.equal(unwrap(result)?.kind, "symlink", name);
        }
        const file = await backend.lstat(abs("file"), signal);
        assert.ok(!isErr(file));
        assert.equal(unwrap(file)?.kind, "file");
    });

    it("stat identifies hardlinks as the same entry", TIMEOUT, async () => {
        const [a, b] = await Promise.all([backend.stat(abs("file"), signal), backend.stat(abs("hardlink"), signal)]);
        assert.ok(!isErr(a) && !isErr(b));
        assert.equal(unwrap(a)?.id, unwrap(b)?.id);
    });

    for (const name of ["fifo", "character-device", "block-device"]) {
        it(`stat reports a ${name} as other`, TIMEOUT, async t => {
            if (!skipIfUnsupported(t, name)) {
                assert.equal(await stat(abs(name)), "other");
            }
        });
    }

    it("readText reads regular files and hardlinks", TIMEOUT, async () => {
        assert.equal(await readText(abs("file")), "content");
        assert.equal(await readText(abs("hardlink")), "content");
        assert.equal(await readText(abs("missing")), null);
    });

    it("readText does not follow symlinks, as git does not for .gitignore", TIMEOUT, async () => {
        assert.equal(await readText(abs("symlink")), null);
        assert.equal(await readText(abs("dangling")), null);
        assert.equal(await readText(abs("loop")), null);
    });

    it("readText returns null for a directory or socket", TIMEOUT, async () => {
        assert.equal(await readText(abs("dir")), null);
        assert.equal(await readText(abs("socket")), null);
    });

    it("readText returns null for a FIFO without a writer instead of blocking", TIMEOUT, async t => {
        if (!skipIfUnsupported(t, "fifo")) {
            assert.equal(await readText(abs("fifo")), null);
        }
    });

    for (const name of ["character-device", "block-device"]) {
        it(`readText returns null for a ${name}`, TIMEOUT, async t => {
            if (!skipIfUnsupported(t, name)) {
                assert.equal(await readText(abs(name)), null);
            }
        });
    }

    it("readText returns null for devices that never stop reading", TIMEOUT, async t => {
        // Device nodes that exist on every Linux system, even where they cannot be created.
        for (const device of ["/dev/zero", "/dev/urandom"]) {
            const target = absolute(device);
            if ((await stat(target)) === null) {
                t.diagnostic(`${device} does not exist here`);
                continue;
            }
            assert.equal(await readText(target), null, device);
        }
    });

    it("watch observes entries of every kind", TIMEOUT, async t => {
        const controller = new AbortController();
        const seen = new Set<FileName | null>();
        const watched = backend.watch(abs("dir"), event => {
            if (event.type !== "lost") {
                seen.add(event.name);
            }
        }, controller.signal);
        assert.ok(!isErr(watched));
        try {
            const names = ["file", "symlink", "socket", "fifo", "character-device"];
            await fs.writeFile(path.join(root, "dir", "file"), "");
            await fs.symlink("file", path.join(root, "dir", "symlink"));
            const dirServer = await listenSocket(path.join(root, "dir", "socket"));
            await new Promise(resolve => dirServer.close(resolve));
            for (
                const [name, reason] of [
                    ["fifo", mkfifo(path.join(root, "dir", "fifo"))],
                    ["character-device", mknod(path.join(root, "dir", "character-device"), "character", 0, 0)],
                ] as const
            ) {
                if (reason !== null) {
                    t.diagnostic(`${name}: ${reason}`);
                    names.splice(names.indexOf(name), 1);
                }
            }
            for (let i = 0; i < 100 && !names.every(name => seen.has(name as FileName)); i++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.deepEqual([...seen].filter(name => names.includes(name!)).sort(), names.sort());
        } finally {
            controller.abort();
        }
    });
});
