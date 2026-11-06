import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { absolutePath, gitignore, watch, type Watcher, type WatchEvent } from "../mod.js";

const skip = process.platform !== "linux" && "Reads inotify state from /proc";

/** Every directory sauron's backend registered a watch for, in order. */
const registrations: string[] = [];
const originalWatch = fs.watch;
fs.watch = ((...args: Parameters<typeof fs.watch>) => {
    registrations.push(String(args[0]));
    return originalWatch(...args);
}) as typeof fs.watch;

/** `major:minor:inode` of every inode this process watches, from inotify's fdinfo (kernel `dev_t` encoding). */
function watchedInodes(): string[] {
    const inodes: string[] = [];
    for (const fd of fs.readdirSync("/proc/self/fdinfo")) {
        let info: string;
        try {
            info = fs.readFileSync(`/proc/self/fdinfo/${fd}`, "utf8");
        } catch {
            continue;
        }
        for (const match of info.matchAll(/^inotify wd:[0-9a-f]+ ino:([0-9a-f]+) sdev:([0-9a-f]+)/gm)) {
            const dev = BigInt(`0x${match[2]!}`);
            inodes.push(`${dev >> 20n}:${dev & 0xfffffn}:${BigInt(`0x${match[1]!}`)}`);
        }
    }
    return inodes.sort();
}

/** The same identity for `dir`, decoding glibc's `dev_t`. */
function inodeOf(dir: string): string {
    const { dev, ino } = fs.statSync(dir, { bigint: true });
    const major = ((dev >> 8n) & 0xfffn) | ((dev >> 32n) & ~0xfffn);
    const minor = (dev & 0xffn) | ((dev >> 12n) & ~0xffn);
    return `${major}:${minor}:${ino}`;
}

function ancestors(dir: string): string[] {
    const all: string[] = [];
    for (let current = path.dirname(dir);; current = path.dirname(current)) {
        all.push(current);
        if (current === path.dirname(current)) {
            return all;
        }
    }
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) {
        await step();
    }
});

type Session = {
    readonly top: string;
    readonly changes: WatchEvent[];
    /** Absolute path within the test directory. */
    at(relative: string): string;
    /**
     * Waits until the watches held by this process are exactly `dirs` (relative to the test directory) plus
     * `extra` (absolute), with nothing watched twice.
     */
    watching(dirs: readonly string[], extra?: readonly string[]): Promise<void>;
    /** Directories (relative to the test directory) newly watched since the last call, or since the crawl. */
    registered(): string[];
    /** Waits for the next `changes` event, as paths relative to the test directory. */
    nextChanges(): Promise<{ paths: string[]; subtrees: string[] }>;
};

async function session(
    setup: (at: (relative: string) => string) => void,
    root: string,
    options: { readonly ignore?: boolean } = {},
): Promise<Session> {
    const top = fs.realpathSync(fs.mkdtempSync(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "rename-")));
    const at = (relative: string) => relative === "." ? top : path.join(top, relative);
    setup(at);
    const rootPath = absolutePath(at(root));
    assert.ok(!isErr(rootPath));
    const created = watch({
        roots: [unwrap(rootPath)],
        settle: { quiet: 30, maxWait: 1_000 },
        ...options.ignore === true ? { ignore: gitignore() } : {},
    });
    assert.ok(!isErr(created));
    const watcher: Watcher = unwrap(created);
    const changes: WatchEvent[] = [];
    const crawled = Promise.withResolvers<void>();
    const pending: (() => void)[] = [];
    void (async () => {
        for await (const event of watcher) {
            if (event.type === "crawl" && event.done) {
                crawled.resolve();
            } else if (event.type === "changes") {
                changes.push(event);
                pending.splice(0).forEach(resolve => resolve());
            }
        }
    })();
    cleanup.push(async () => {
        await watcher[Symbol.asyncDispose]();
        assert.deepEqual(watchedInodes(), [], "every watch is released on disposal");
        fs.rmSync(top, { recursive: true, force: true });
    });
    await crawled.promise;
    registrations.length = 0;
    const rel = (target: string) => path.relative(top, target) || ".";
    return {
        top,
        changes,
        at,
        async watching(dirs, extra = []) {
            const rootPath = at(root);
            const expected = [...dirs.map(at), ...extra].map(inodeOf).sort();
            const describe = () => {
                const actual = watchedInodes();
                const names = new Map<string, string>();
                for (const dir of [...ancestors(rootPath), ...extra, ...walk(top)]) {
                    names.set(inodeOf(dir), dir.startsWith(top) ? rel(dir) : dir);
                }
                return `watching ${JSON.stringify(actual.map(id => names.get(id) ?? id))}`;
            };
            const deadline = performance.now() + 5_000;
            while (watchedInodes().join() !== expected.join()) {
                assert.ok(performance.now() < deadline, describe());
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        },
        registered() {
            return registrations.splice(0).map(rel).sort();
        },
        async nextChanges() {
            if (changes.length === 0) {
                const arrived = new Promise<void>(resolve => pending.push(resolve));
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("No changes reported")), 5_000).unref()
                );
                await Promise.race([arrived, timeout]);
            }
            const event = changes.shift() as Extract<WatchEvent, { type: "changes" }>;
            return { paths: [...event.paths].map(rel).sort(), subtrees: [...event.subtrees].map(rel).sort() };
        },
    };
}

function walk(dir: string): string[] {
    const all = [dir];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            all.push(...walk(path.join(dir, entry.name)));
        }
    }
    return all;
}

function mkdirs(at: (relative: string) => string, ...dirs: string[]): void {
    for (const dir of dirs) {
        fs.mkdirSync(at(dir), { recursive: true });
    }
}

/** Ancestors of `root/` within and above the test directory. */
function above(s: Session, root = "root"): string[] {
    return ancestors(s.at(root));
}

test("a directory renamed within its parent is watched at its new path only", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/a/sub/deep"), "root");
    await s.watching(["root", "root/a", "root/a/sub", "root/a/sub/deep"], above(s));

    fs.renameSync(s.at("root/a"), s.at("root/b"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/b"] });
    await s.watching(["root", "root/b", "root/b/sub", "root/b/sub/deep"], above(s));
    assert.deepEqual(s.registered(), [], "the moved watches are kept");
    fs.writeFileSync(s.at("root/b/sub/deep/new"), "");
    assert.deepEqual(await s.nextChanges(), { paths: ["root/b/sub/deep/new"], subtrees: [] });
});

test("a directory moved to another watched parent is watched there only", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/x/a/sub", "root/y"), "root");
    await s.watching(["root", "root/x", "root/x/a", "root/x/a/sub", "root/y"], above(s));

    fs.renameSync(s.at("root/x/a"), s.at("root/y/a"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/x/a", "root/y/a"] });
    await s.watching(["root", "root/x", "root/y", "root/y/a", "root/y/a/sub"], above(s));
    assert.deepEqual(s.registered(), [], "the moved watches are kept");
});

test("a directory moved out of the root is released", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/a/sub"), "root");

    fs.renameSync(s.at("root/a"), s.at("outside"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a"] });
    await s.watching(["root"], above(s));
    fs.writeFileSync(s.at("outside/sub/new"), "");
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(s.changes, []);
});

test("a directory moved into the root is crawled", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root", "outside/sub"), "root");
    await s.watching(["root"], above(s));

    fs.renameSync(s.at("outside"), s.at("root/a"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a"] });
    await s.watching(["root", "root/a", "root/a/sub"], above(s));
    assert.deepEqual(s.registered(), ["root/a", "root/a/sub"]);
});

test("a directory renamed to an ignored name is released", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/src/sub");
            fs.writeFileSync(at("root/.gitignore"), "build/\n");
        },
        "root",
        { ignore: true },
    );

    fs.renameSync(s.at("root/src"), s.at("root/build"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/src"] });
    await s.watching(["root"], above(s));
});

test("a directory renamed from an ignored name is crawled", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/build/sub");
            fs.writeFileSync(at("root/.gitignore"), "build/\n");
        },
        "root",
        { ignore: true },
    );
    await s.watching(["root"], above(s));

    fs.renameSync(s.at("root/build"), s.at("root/src"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/src"] });
    await s.watching(["root", "root/src", "root/src/sub"], above(s));
});

test("a directory moved under different .gitignore rules is watched as they say", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/a/gen/deep", "root/a/keep", "root/x");
            fs.writeFileSync(at("root/x/.gitignore"), "gen/\n");
        },
        "root",
        { ignore: true },
    );
    await s.watching(["root", "root/a", "root/a/gen", "root/a/gen/deep", "root/a/keep", "root/x"], above(s));

    fs.renameSync(s.at("root/a"), s.at("root/x/a"));
    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/x/a"] });
    await s.watching(["root", "root/x", "root/x/a", "root/x/a/keep"], above(s));
    assert.deepEqual(s.registered(), [], "what is still watched is kept");

    fs.renameSync(s.at("root/x/a"), s.at("root/a"));
    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/x/a"] });
    await s.watching(["root", "root/a", "root/a/gen", "root/a/gen/deep", "root/a/keep", "root/x"], above(s));
    assert.deepEqual(s.registered(), ["root/a/gen", "root/a/gen/deep"], "only what is no longer ignored is new");
});

test("a directory renamed in place of an ignored file the rules keep as a directory is crawled", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/o/d/sub");
            fs.writeFileSync(at("root/cache"), "");
            fs.writeFileSync(at("root/.gitignore"), "/cache\n!/cache/\n");
        },
        "root",
        { ignore: true },
    );

    fs.rmSync(s.at("root/cache"));
    fs.renameSync(s.at("root/o/d"), s.at("root/cache"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/cache", "root/o/d"] });
    await s.watching(["root", "root/cache", "root/cache/sub", "root/o"], above(s));
});

test("moving a directory above the root's parent reports the root gone, and its re-creation", { skip }, async () => {
    const s = await session(at => mkdirs(at, "g/p/root/sub"), "g/p/root");
    await s.watching(["g/p/root", "g/p/root/sub"], above(s, "g/p/root"));

    fs.renameSync(s.at("g"), s.at("g2"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["g/p/root"] });
    // Anchored on the nearest existing ancestor, and nothing in the moved tree.
    await s.watching([], above(s, "g"));

    mkdirs(s.at, "g/p/root/sub");
    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["g/p/root"] });
    await s.watching(["g/p/root", "g/p/root/sub"], above(s, "g/p/root"));
});

test("a root symlink is reported gone when the directory holding its target moves", { skip }, async () => {
    const s = await session(at => {
        mkdirs(at, "tp/target/sub");
        fs.symlinkSync(at("tp/target"), at("root"));
    }, "root");
    // The way to the target is watched too.
    await s.watching(["tp/target", "tp/target/sub", "tp"], above(s));

    fs.renameSync(s.at("tp"), s.at("tp2"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching([], above(s));
});

test("a root symlink is reported gone when its target is renamed", { skip }, async () => {
    const s = await session(at => {
        mkdirs(at, "target/sub");
        fs.symlinkSync(at("target"), at("root"));
    }, "root");
    await s.watching(["target", "target/sub"], above(s));

    fs.renameSync(s.at("target"), s.at("target2"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching([], above(s));
});

test("a directory moved where a pattern anchored above it applies is visited again", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/a/gen/deep", "root/a/src");
            fs.writeFileSync(at("root/.gitignore"), "/b/gen\n*.log\n");
        },
        "root",
        { ignore: true },
    );

    fs.renameSync(s.at("root/a"), s.at("root/b"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/b"] });
    await s.watching(["root", "root/b", "root/b/src"], above(s));
    assert.deepEqual(s.registered(), []);
});

test("a .gitignore within a moved directory still applies there", { skip }, async () => {
    const s = await session(
        at => {
            mkdirs(at, "root/a/out", "root/a/src/out", "root/deeper");
            fs.writeFileSync(at("root/a/.gitignore"), "/out\n*.tmp\n");
        },
        "root",
        { ignore: true },
    );
    await s.watching(["root", "root/a", "root/a/src", "root/a/src/out", "root/deeper"], above(s));

    fs.renameSync(s.at("root/a"), s.at("root/deeper/b"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/deeper/b"] });
    await s.watching(["root", "root/deeper", "root/deeper/b", "root/deeper/b/src", "root/deeper/b/src/out"], above(s));
    assert.deepEqual(s.registered(), []);
    fs.writeFileSync(s.at("root/deeper/b/src/x.tmp"), "");
    fs.writeFileSync(s.at("root/deeper/b/src/y"), "");
    assert.deepEqual(await s.nextChanges(), { paths: ["root/deeper/b/src/y"], subtrees: [] });
});

test("a metadata change to a directory keeps its watches", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/a/sub"), "root");

    fs.chmodSync(s.at("root/a"), 0o700);

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a"] });
    await s.watching(["root", "root/a", "root/a/sub"], above(s));
    assert.deepEqual(s.registered(), []);
});

test("a directory deleted and re-created at once is watched afresh, whatever its inode number", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/a/sub/deep"), "root");

    // File systems reuse freed inode numbers, so the new directories may have the old ones' identities.
    fs.rmSync(s.at("root/a"), { recursive: true });
    mkdirs(s.at, "root/a/sub/deep");

    await s.watching(["root", "root/a", "root/a/sub", "root/a/sub/deep"], above(s));
    assert.deepEqual(s.registered(), ["root/a", "root/a/sub", "root/a/sub/deep"]);
    await s.nextChanges();
    fs.writeFileSync(s.at("root/a/sub/deep/new"), "");
    assert.deepEqual(await s.nextChanges(), { paths: ["root/a/sub/deep/new"], subtrees: [] });
});

test("directories swapped by renames keep their watches", { skip }, async () => {
    const s = await session(at => mkdirs(at, "root/a/sub", "root/b/sub"), "root");
    const [aSub, bSub] = [inodeOf(s.at("root/a/sub")), inodeOf(s.at("root/b/sub"))];

    fs.renameSync(s.at("root/a"), s.at("root/tmp"));
    fs.renameSync(s.at("root/b"), s.at("root/a"));
    fs.renameSync(s.at("root/tmp"), s.at("root/b"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root/a", "root/b"] });
    await s.watching(["root", "root/a", "root/a/sub", "root/b", "root/b/sub"], above(s));
    assert.deepEqual([inodeOf(s.at("root/a/sub")), inodeOf(s.at("root/b/sub"))], [bSub, aSub]);
    fs.writeFileSync(s.at("root/a/sub/x"), "");
    fs.writeFileSync(s.at("root/b/sub/y"), "");
    assert.deepEqual(await s.nextChanges(), { paths: ["root/a/sub/x", "root/b/sub/y"], subtrees: [] });
});

test("a dangling root symlink is watched once its target appears", { skip }, async () => {
    const s = await session(at => fs.symlinkSync("t", at("root")), "root");
    await s.watching([], above(s));

    mkdirs(s.at, "t/sub");

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["t", "t/sub"], above(s));
});

test("a dangling root symlink's target is found as the directories on the way are created", { skip }, async () => {
    const s = await session(at => fs.symlinkSync(at("a/b/t"), at("root")), "root");

    fs.mkdirSync(s.at("a"));
    await s.watching(["a"], above(s));
    fs.mkdirSync(s.at("a/b"));
    await s.watching(["a", "a/b"], above(s));
    assert.deepEqual(s.changes, []);

    fs.mkdirSync(s.at("a/b/t"));
    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["a", "a/b", "a/b/t"], above(s));
});

test("a dangling root symlink resolves once a symlink on the way is pointed elsewhere", { skip }, async () => {
    const s = await session(at => {
        mkdirs(at, "y/sub");
        fs.symlinkSync("l2", at("root"));
        fs.symlinkSync("x", at("l2"));
    }, "root");

    fs.symlinkSync("y", s.at("tmp"));
    fs.renameSync(s.at("tmp"), s.at("l2"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["y", "y/sub"], above(s));
});

test("a dangling root symlink resolves once a directory symlinked on the way appears", { skip }, async () => {
    const s = await session(at => {
        fs.symlinkSync("m/t", at("root"));
        fs.symlinkSync("real", at("m"));
    }, "root");

    mkdirs(s.at, "real/t/sub");

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["real", "real/t", "real/t/sub"], above(s));
});

test("a root symlink in a loop resolves once the loop is broken", { skip }, async () => {
    const s = await session(at => {
        fs.symlinkSync("a", at("root"));
        fs.symlinkSync("root", at("a"));
    }, "root");
    await s.watching([], above(s));

    fs.rmSync(s.at("a"));
    mkdirs(s.at, "a/sub");

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["a", "a/sub"], above(s));
});

test("a root symlink pointed elsewhere watches its new target only", { skip }, async () => {
    const s = await session(at => {
        mkdirs(at, "t1/sub", "t2/sub");
        fs.symlinkSync("t1", at("root"));
    }, "root");
    await s.watching(["t1", "t1/sub"], above(s));

    // As `ln -sfn` does: a new symlink renamed over the old one.
    fs.symlinkSync("t2", s.at("tmp"));
    fs.renameSync(s.at("tmp"), s.at("root"));

    assert.deepEqual(await s.nextChanges(), { paths: [], subtrees: ["root"] });
    await s.watching(["t2", "t2/sub"], above(s));
    fs.writeFileSync(s.at("t1/sub/old"), "");
    fs.writeFileSync(s.at("t2/sub/new"), "");
    assert.deepEqual(await s.nextChanges(), { paths: ["root/sub/new"], subtrees: [] });
});
