/**
 * Entries other than regular files and directories (symlinks, FIFOs, sockets, devices), hardlinks and reflinks,
 * entries changing type, and metadata changes, on a real file system.
 *
 * Scenarios share one watcher and run in file order. Each step first flushes earlier events (see `flush`), so a
 * late batch from one step cannot satisfy the next.
 */
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it, type TestContext } from "node:test";
import {
    type AbsolutePath,
    absolutePath,
    gitignore,
    watch,
    type Watcher,
    type WatchError,
    type WatchOptions,
} from "../mod.js";
import { isWithin } from "../path.js";
import { listenSocket, mkfifo, mknod, removeXattr, setXattr } from "../special-files.it.stub.js";

const TIMEOUT = { timeout: 15_000 };
const SETTLE = { quiet: 50, maxWait: 2_000 };

type Seen = { readonly paths: Set<AbsolutePath>; readonly subtrees: Set<AbsolutePath> };

let tmp: string;
let root: string;
let outside: string;
let watcher: Watcher;
let crawledDirectories = 0;
let markers = 0;
const errors: WatchError[] = [];
/** Keyed by socket path. */
const servers = new Map<string, net.Server>();

function abs(...segments: string[]): AbsolutePath {
    const result = absolutePath(path.join(...segments));
    assert.ok(!isErr(result));
    return unwrap(result);
}

function at(...segments: string[]): AbsolutePath {
    return abs(root, ...segments);
}

function covers(seen: Seen, target: AbsolutePath): boolean {
    return seen.paths.has(target) || seen.subtrees.has(target)
        || seen.subtrees.values().some(dir => isWithin(target, dir));
}

/** Reads `changes` batches from `from` until they cover every target, returning everything reported meanwhile. */
async function reported(from: Watcher, ...targets: AbsolutePath[]): Promise<Seen> {
    const seen: Seen = { paths: new Set(), subtrees: new Set() };
    while (!targets.every(target => covers(seen, target))) {
        const result = await from.next();
        assert.equal(result.done, false, "watcher closed early");
        const event = result.value;
        if (event.type === "changes") {
            event.paths.forEach(p => seen.paths.add(p));
            event.subtrees.forEach(p => seen.subtrees.add(p));
        } else if (event.type === "error" || event.type === "degraded") {
            errors.push(event.error);
        }
    }
    return seen;
}

/**
 * Writes a new marker file and waits for it, returning everything reported until then. Events are read in order,
 * so anything caused before the marker was written has been reported by the time it is.
 */
function flush(): Promise<Seen> {
    const marker = at("markers", `${markers++}`);
    return fs.writeFile(marker, "").then(() => reported(watcher, marker));
}

/** Runs `change` once earlier events are flushed, then waits for it to be reported. */
async function step(change: () => Promise<unknown>, ...targets: AbsolutePath[]): Promise<Seen> {
    await flush();
    await change();
    return reported(watcher, ...targets);
}

/** Runs `change`, then checks that none of `targets` is reported by the time a later marker is. */
async function notReported(change: () => Promise<unknown>, ...targets: AbsolutePath[]): Promise<void> {
    await flush();
    await change();
    const seen = await flush();
    for (const target of targets) {
        assert.ok(!covers(seen, target), `${target} was reported`);
    }
}

async function started(
    roots: [AbsolutePath, ...AbsolutePath[]],
    options: Partial<WatchOptions> = {},
): Promise<[Watcher, number]> {
    const created = watch({ roots, ignore: gitignore(), settle: SETTLE, ...options });
    assert.ok(!isErr(created));
    const started = unwrap(created);
    for (;;) {
        const result = await started.next();
        assert.equal(result.done, false);
        const event = result.value;
        if (event.type === "crawl" && event.done) {
            return [started, event.directories];
        }
        if (event.type === "error" || event.type === "degraded") {
            errors.push(event.error);
        }
    }
}

async function socket(target: string): Promise<string | null> {
    servers.set(target, await listenSocket(target));
    return null;
}

/** Ways to create each kind of entry. Each returns why it cannot be created here, if it cannot. */
const CREATE = {
    "regular file": (target: string) => fs.writeFile(target, "content").then(() => null),
    "symlink to a file": (target: string) => fs.symlink(path.join(root, "meta", "f"), target).then(() => null),
    "symlink to a directory": (target: string) => fs.symlink(path.join(root, "meta"), target).then(() => null),
    "dangling symlink": (target: string) => fs.symlink("missing", target).then(() => null),
    "symlink loop": (target: string) => fs.symlink(path.basename(target), target).then(() => null),
    FIFO: async (target: string) => mkfifo(target),
    socket,
    "character device": async (target: string) => mknod(target, "character", 0, 0),
    "block device": async (target: string) => mknod(target, "block", 7, 0),
} satisfies Record<string, (target: string) => Promise<string | null>>;

type Kind = keyof typeof CREATE;

async function create(t: TestContext, kind: Kind, target: string): Promise<boolean> {
    const reason = await CREATE[kind](target);
    if (reason !== null) {
        t.skip(reason);
    }
    return reason === null;
}

async function remove(target: string): Promise<void> {
    const server = servers.get(target);
    if (server !== undefined) {
        servers.delete(target);
        await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(target, { recursive: true, force: true });
}

describe(
    "special entries",
    { skip: process.platform === "linux" ? false : "needs Linux file system semantics" },
    () => {
        before(async () => {
            tmp = await fs.realpath(await fs.mkdtemp(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "special-")));
            root = path.join(tmp, "root");
            outside = path.join(tmp, "outside");
            for (const dir of ["markers", "pre/fifo-ignore", "pre/link-ignore", "meta/dir", "kinds", "links"]) {
                await fs.mkdir(path.join(root, dir), { recursive: true });
            }
            await fs.mkdir(outside);
            await fs.writeFile(path.join(outside, "file"), "");
            await fs.writeFile(path.join(root, "meta", "f"), "content");
            await fs.writeFile(path.join(root, "links", "a"), "content");

            // Present before the crawl, which must neither follow nor open them.
            const pre = path.join(root, "pre");
            await fs.symlink(".", path.join(pre, "loop"));
            await fs.symlink("self", path.join(pre, "self"));
            await fs.symlink("missing", path.join(pre, "dangling"));
            await fs.symlink(outside, path.join(pre, "outside"));
            await socket(path.join(pre, "socket"));
            mkfifo(path.join(pre, "fifo"));
            mknod(path.join(pre, "character-device"), "character", 0, 0);
            // git does not read a .gitignore that is not a regular file.
            await fs.writeFile(path.join(pre, "ignore-txt"), "*.txt\n");
            await fs.symlink("../ignore-txt", path.join(pre, "link-ignore", ".gitignore"));
            if (mkfifo(path.join(pre, "fifo-ignore", ".gitignore")) !== null) {
                await socket(path.join(pre, "fifo-ignore", ".gitignore"));
            }

            [watcher, crawledDirectories] = await started([abs(root)]);
        });

        after(async () => {
            await watcher[Symbol.asyncDispose]();
            await Promise.all(servers.values().map(server => new Promise(resolve => server.close(resolve))));
            await fs.chmod(path.join(root, "meta", "dir"), 0o755).catch(() => {});
            await fs.rm(tmp, { recursive: true, force: true });
        });

        it("the initial crawl completes without following symlinks or opening special files", TIMEOUT, () => {
            // root, markers, pre, pre/fifo-ignore, pre/link-ignore, meta, meta/dir, kinds, links
            assert.equal(crawledDirectories, 9);
        });

        it("symlinks to directories are not followed, in or out of the tree", TIMEOUT, async () => {
            await notReported(() => fs.writeFile(path.join(outside, "new"), ""), at("pre", "outside", "new"));
            // Reported where it is, not through the symlink.
            const seen = await step(
                () => fs.writeFile(path.join(root, "pre", "loop", "via-loop"), ""),
                at("pre", "via-loop"),
            );
            assert.ok(!covers(seen, at("pre", "loop", "via-loop")));
        });

        it("a .gitignore that is a FIFO or socket is not read", TIMEOUT, async () => {
            await step(
                () => fs.writeFile(path.join(root, "pre", "fifo-ignore", "a.txt"), ""),
                at("pre", "fifo-ignore", "a.txt"),
            );
        });

        it("a .gitignore that is a symlink is not followed, as git does not follow it", TIMEOUT, async () => {
            await step(
                () => fs.writeFile(path.join(root, "pre", "link-ignore", "a.txt"), ""),
                at("pre", "link-ignore", "a.txt"),
            );
        });

        for (const kind of Object.keys(CREATE) as Kind[]) {
            it(`a ${kind} is reported when created, when its metadata changes and when removed`, TIMEOUT, async t => {
                const target = path.join(root, "kinds", kind.replaceAll(" ", "-"));
                await flush();
                if (!(await create(t, kind, target))) {
                    return;
                }
                await reported(watcher, abs(target));
                // Neither follows symlinks (Linux has no lchmod).
                const isSymlink = (await fs.lstat(target)).isSymbolicLink();
                await step(
                    () => isSymlink ? fs.lutimes(target, new Date(1e12), new Date(1e12)) : fs.chmod(target, 0o600),
                    abs(target),
                );
                await step(() => remove(target), abs(target));
            });
        }

        it("an entry is reported each time its type changes", TIMEOUT, async t => {
            const target = path.join(root, "kinds", "x");
            const sequence: Kind[] = [
                "regular file",
                "FIFO",
                "symlink to a directory",
                "socket",
                "character device",
                "dangling symlink",
                "regular file",
            ];
            for (const kind of sequence) {
                await flush();
                await remove(target);
                const reason = await CREATE[kind](target);
                if (reason !== null) {
                    t.diagnostic(`skipped ${kind}: ${reason}`);
                    continue;
                }
                await reported(watcher, abs(target));
            }

            // A directory is watched once it replaces another entry, and no longer once replaced by a symlink.
            await step(async () => {
                await remove(target);
                await fs.mkdir(target);
            }, abs(target));
            await step(() => fs.writeFile(path.join(target, "inner"), ""), abs(target, "inner"));
            await step(async () => {
                await remove(target);
                await fs.symlink(outside, target);
            }, abs(target));
            await notReported(() => fs.writeFile(path.join(outside, "inner"), ""), abs(target, "inner"));

            // As editors save: a new entry renamed over the old one.
            await remove(target);
            await fs.writeFile(target, "");
            const fifo = path.join(root, "kinds", "x.tmp");
            if (mkfifo(fifo) === null) {
                await step(() => fs.rename(fifo, target), abs(target));
            }
        });

        it("metadata changes to a file are reported", TIMEOUT, async t => {
            const f = path.join(root, "meta", "f");
            const target = abs(f);
            const before = await fs.stat(f);
            await step(() => fs.chmod(f, 0o600), target);
            // Only its ctime changes, which git compares (core.trustctime).
            await step(() => fs.chmod(f, 0o600), target);
            // Changing the owner needs privileges, but changing the group to another of the user's groups does not.
            const otherGroup = process.getgroups?.().find(group => group !== before.gid);
            t.diagnostic(otherGroup === undefined ? "no other group to change to" : `changing group to ${otherGroup}`);
            await step(() => fs.chown(f, before.uid, otherGroup ?? before.gid), target);
            await step(() => fs.utimes(f, new Date(1e12), before.mtime), target);
            await step(() => fs.utimes(f, before.atime, new Date(1e12)), target);
            const xattr = await (async () => {
                await flush();
                return setXattr(f, "user.sauron", "1");
            })();
            if (xattr === null) {
                await reported(watcher, target);
                await step(async () => assert.equal(setXattr(f, "user.sauron", "2"), null), target);
                await step(async () => assert.equal(removeXattr(f, "user.sauron"), null), target);
            } else {
                t.diagnostic(`extended attributes are unsupported here: ${xattr}`);
            }
            await step(() => fs.appendFile(f, "more"), target);
        });

        it("a file's creation time only changes by replacing it, which is reported", TIMEOUT, async t => {
            const f = path.join(root, "meta", "f");
            const before = await fs.stat(f);
            const copy = path.join(root, "meta", "f.new");
            await fs.copyFile(f, copy);
            await step(() => fs.rename(copy, f), abs(f));
            const after = await fs.stat(f);
            assert.notEqual(after.ino, before.ino);
            t.diagnostic(`birthtime ${before.birthtimeMs} -> ${after.birthtimeMs} (0 where unsupported)`);
        });

        it("reading a file is not reported, so git reading files cannot cause a feedback loop", TIMEOUT, async () => {
            const f = path.join(root, "meta", "f");
            await notReported(() => fs.readFile(f), abs(f));
        });

        it("metadata changes to a directory are reported as its subtree, which is crawled again", TIMEOUT, async t => {
            // Node reports them as `rename` (inotify sets IN_ISDIR), so the directory may have been replaced.
            const dir = path.join(root, "meta", "dir");
            const target = abs(dir);
            const before = await fs.stat(dir);
            const changes: [string, () => Promise<unknown>][] = [
                ["permissions", () => fs.chmod(dir, 0o700)],
                ["owner", () => fs.chown(dir, before.uid, before.gid)],
                ["times", () => fs.utimes(dir, new Date(1e12), new Date(1e12))],
            ];
            if (setXattr(dir, "user.probe", "") === null) {
                changes.push([
                    "extended attributes",
                    async () => assert.equal(setXattr(dir, "user.sauron", "1"), null),
                ]);
            } else {
                t.diagnostic("extended attributes are unsupported here");
            }
            for (const [label, change] of changes) {
                const seen = await step(change, target);
                assert.ok(seen.subtrees.has(target), `${label} was not reported as a subtree`);
                await step(() => fs.writeFile(path.join(dir, label), ""), abs(dir, label));
            }
        });

        it("a directory made unreadable is watched again once readable", TIMEOUT, async () => {
            const dir = path.join(root, "meta", "dir");
            await flush();
            await fs.chmod(dir, 0o000);
            await new Promise(resolve => setTimeout(resolve, 50));
            await fs.chmod(dir, 0o755);
            await reported(watcher, abs(dir));
            // Re-watched by a retry, which reports the directory again. Await that before checking it is watched.
            await fs.writeFile(path.join(dir, "readable"), "");
            await reported(watcher, abs(dir, "readable"));
            await step(() => fs.writeFile(path.join(dir, "watched"), ""), abs(dir, "watched"));
        });

        it("a hardlink is reported when created and removed", TIMEOUT, async () => {
            const a = path.join(root, "links", "a");
            await step(() => fs.link(a, path.join(root, "links", "b")), at("links", "b"));
            await step(() => fs.link(a, path.join(root, "meta", "a")), at("meta", "a"));
            await step(() => fs.rm(path.join(root, "meta", "a")), at("meta", "a"));
        });

        it("a write or metadata change through a hardlink is reported for that link", TIMEOUT, async () => {
            const b = path.join(root, "links", "b");
            await step(() => fs.appendFile(b, "more"), at("links", "b"));
            await step(() => fs.chmod(b, 0o600), at("links", "b"));
        });

        it("a write through a hardlink is reported for its other links in the tree", {
            ...TIMEOUT,
            todo: "inotify reports only the path written through. Knowing the other links needs an lstat per file, "
                + "and would still miss links created after the crawl",
        }, async () => {
            await step(() => fs.appendFile(path.join(root, "links", "b"), "more"), at("links", "b"));
            const seen = await flush();
            assert.ok(covers(seen, at("links", "a")));
        });

        it("a write through a hardlink created outside the tree is reported for the link inside", {
            ...TIMEOUT,
            todo: "nothing inside the tree is written through, so no watch on it sees the change",
        }, async () => {
            const link = path.join(outside, "a");
            await fs.link(path.join(root, "links", "a"), link);
            await fs.appendFile(link, "more");
            const seen = await flush();
            assert.ok(covers(seen, at("links", "a")));
        });

        it("a reflink is reported when created, and writes to it are not reported for its source", TIMEOUT, async t => {
            const a = path.join(root, "links", "a");
            const clone = path.join(root, "links", "clone");
            try {
                await fs.copyFile(a, path.join(tmp, "reflink-probe"), fs.constants.COPYFILE_FICLONE_FORCE);
                t.diagnostic("reflinks are supported here");
            } catch (e) {
                // A reflink is a new file sharing blocks until written, so a copy behaves the same to a watcher.
                t.diagnostic(`reflinks are unsupported here, so this copies instead: ${String(e)}`);
            }
            const content = await fs.readFile(a, "utf8");
            await step(() => fs.copyFile(a, clone, fs.constants.COPYFILE_FICLONE), at("links", "clone"));
            await notReported(() => fs.appendFile(clone, "more"), at("links", "a"));
            assert.equal(await fs.readFile(a, "utf8"), content);
        });

        it("a root that is a FIFO is watched as a file", TIMEOUT, async t => {
            const fifo = path.join(tmp, "fifo-root");
            const reason = mkfifo(fifo);
            if (reason !== null) {
                t.skip(reason);
                return;
            }
            const [fifoWatcher] = await started([abs(fifo)]);
            await using _fifoWatcher = fifoWatcher;
            await fs.chmod(fifo, 0o600);
            await reported(fifoWatcher, abs(fifo));
        });

        it("a root that is a symlink loop is watched once the symlink points to a directory", TIMEOUT, async () => {
            const link = path.join(tmp, "loop-root");
            const target = path.join(tmp, "loop-target");
            await fs.symlink("loop-root", link);
            await fs.mkdir(target);
            const errorsBefore = errors.length;
            // Any failure is reported at once rather than retried, so a loop being treated as one is seen.
            const [loopWatcher, directories] = await started([abs(link)], { retry: { attempts: 0 } });
            await using _loopWatcher = loopWatcher;
            assert.equal(directories, 0);
            await fs.rm(link);
            await fs.symlink(target, link);
            await reported(loopWatcher, abs(link));
            await fs.writeFile(path.join(link, "file"), "");
            await reported(loopWatcher, abs(link, "file"));
            assert.deepEqual(errors.slice(errorsBefore), []);
        });

        it("a root that is a symlink is watched as one when root symlinks are not followed", TIMEOUT, async () => {
            const link = path.join(tmp, "link-root");
            const target = path.join(tmp, "link-target");
            await fs.mkdir(target);
            await fs.symlink(target, link);
            const [linkWatcher, directories] = await started([abs(link)], { followRootSymlinks: false });
            await using _linkWatcher = linkWatcher;
            assert.equal(directories, 0);

            // Its target is not watched, but the symlink's own metadata is.
            await fs.writeFile(path.join(target, "inside"), "");
            await fs.lutimes(link, new Date(1e12), new Date(1e12));
            const seen = await reported(linkWatcher, abs(link));
            assert.ok(!covers(seen, abs(link, "inside")));

            await fs.rm(link);
            await fs.symlink(outside, link);
            await reported(linkWatcher, abs(link));
        });

        it("no errors are reported, other than for the directory made unreadable", TIMEOUT, async () => {
            await flush();
            const unreadable = at("meta", "dir");
            assert.deepEqual(errors.filter(error => error.path !== unreadable), []);
        });
    },
);
