import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { type AbsolutePath, absolutePath, watch, type Watcher, type WatchEvent } from "../mod.js";

/** Inodes (hex) the kernel watches for this process, from inotify's fdinfo. */
function watchedInodes(): Set<string> {
    const inodes = new Set<string>();
    for (const fd of fs.readdirSync("/proc/self/fdinfo")) {
        let info: string;
        try {
            info = fs.readFileSync(`/proc/self/fdinfo/${fd}`, "utf8");
        } catch {
            continue;
        }
        for (const match of info.matchAll(/^inotify wd:[0-9a-f]+ ino:([0-9a-f]+)/gm)) {
            inodes.add(match[1]!);
        }
    }
    return inodes;
}

function inode(dir: string): string {
    return fs.statSync(dir, { bigint: true }).ino.toString(16);
}

/** Which of `dirs` the kernel currently watches. */
function watched(...dirs: string[]): string[] {
    const inodes = watchedInodes();
    return dirs.filter(dir => fs.existsSync(dir) && inodes.has(inode(dir)));
}

function tempDir(): string {
    return fs.realpathSync(fs.mkdtempSync(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "anchor-")));
}

/** Watches `root` until its crawl is done. `events` collects everything after, `changes` just the changes. */
async function start(root: string): Promise<{ watcher: Watcher; events: WatchEvent[]; changes: WatchEvent[] }> {
    const target = absolutePath(root);
    assert.ok(!isErr(target));
    const created = watch({ roots: [unwrap(target)], settle: { quiet: 20, maxWait: 1_000 } });
    assert.ok(!isErr(created));
    const watcher = unwrap(created);
    const events: WatchEvent[] = [];
    const changes: WatchEvent[] = [];
    const crawled = Promise.withResolvers<void>();
    void (async () => {
        for await (const event of watcher) {
            if (event.type === "crawl") {
                if (event.done) {
                    crawled.resolve();
                }
                continue;
            }
            events.push(event);
            if (event.type === "changes") {
                changes.push(event);
            }
        }
    })();
    await crawled.promise;
    return { watcher, events, changes };
}

async function until(condition: () => boolean, message: () => string): Promise<void> {
    const deadline = performance.now() + 5_000;
    while (!condition()) {
        assert.ok(performance.now() < deadline, message());
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

test("anchors follow a missing root down, ignore unrelated activity, and are released", {
    skip: process.platform !== "linux" && "Reads inotify state from /proc",
}, async () => {
    const top = tempDir();
    const [p, q, r] = [path.join(top, "p"), path.join(top, "p/q"), path.join(top, "p/q/r")];
    const { watcher, changes } = await start(r);
    const show = () => `watched: ${JSON.stringify(watched(top, p, q, r).map(dir => path.relative(top, dir)))}`;

    try {
        assert.deepEqual(watched(top), [top], show());

        // Unrelated: neither on the way to the root, nor the root itself.
        fs.writeFileSync(path.join(top, "other"), "");
        fs.appendFileSync(path.join(top, "other"), "changed");
        fs.mkdirSync(path.join(top, "unrelated/deep"), { recursive: true });
        fs.rmSync(path.join(top, "other"));
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.deepEqual(watched(top, path.join(top, "unrelated"), path.join(top, "unrelated/deep")), [top], show());
        assert.deepEqual(changes, []);

        fs.mkdirSync(p);
        await until(() => watched(top, p).join() === p, show);

        fs.mkdirSync(r, { recursive: true });
        await until(() => watched(top, p, q, r).join() === [q, r].join(), show);
        await until(() => changes.length > 0, () => "The root's creation was not reported");
        assert.deepEqual(changes, [{ type: "changes", paths: new Set(), subtrees: new Set([r as AbsolutePath]) }]);
    } finally {
        await watcher[Symbol.asyncDispose]();
    }
    await until(() => watched(top, p, q, r).length === 0, show);
    fs.rmSync(top, { recursive: true, force: true });
});

test("activity next to a directory root is not reported and does not re-crawl it", {
    skip: process.platform !== "linux" && "Reads inotify state from /proc",
}, async () => {
    const top = tempDir();
    const root = path.join(top, "root");
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    const { watcher, events } = await start(root);
    const subInode = inode(sub);

    try {
        fs.writeFileSync(path.join(top, "sibling"), "");
        fs.appendFileSync(path.join(top, "sibling"), "changed");
        fs.mkdirSync(path.join(top, "other/deep"), { recursive: true });
        fs.renameSync(path.join(top, "sibling"), path.join(top, "sibling2"));
        fs.rmSync(path.join(top, "other"), { recursive: true });
        fs.writeFileSync(path.join(sub, "file"), "");
        await until(() => events.some(event => event.type === "changes"), () => "The change was not reported");
        await new Promise(resolve => setTimeout(resolve, 100));

        assert.deepEqual(events.filter(event => event.type === "changes"), [{
            type: "changes",
            paths: new Set([path.join(sub, "file") as AbsolutePath]),
            subtrees: new Set(),
        }]);
        // Same directory, same watch: not re-crawled.
        assert.equal(inode(sub), subInode);
        assert.deepEqual(watched(top, root, sub), [top, root, sub]);
    } finally {
        await watcher[Symbol.asyncDispose]();
    }
    fs.rmSync(top, { recursive: true, force: true });
});

test("moving the directory holding a root reports the root gone and releases the moved watches", {
    skip: process.platform !== "linux" && "Reads inotify state from /proc",
}, async () => {
    const top = tempDir();
    const root = path.join(top, "p/root");
    fs.mkdirSync(path.join(root, "sub"), { recursive: true });
    const { watcher, changes } = await start(root);
    const moved = [path.join(top, "p2"), path.join(top, "p2/root"), path.join(top, "p2/root/sub")];
    const show = () => `watched: ${JSON.stringify(watched(top, ...moved).map(dir => path.relative(top, dir)))}`;

    try {
        // The root's own watches see nothing: only the directory holding it moved.
        fs.renameSync(path.join(top, "p"), path.join(top, "p2"));
        await until(() => changes.length > 0, () => "The root's removal was not reported");
        assert.deepEqual(changes, [{ type: "changes", paths: new Set(), subtrees: new Set([root as AbsolutePath]) }]);
        await until(() => watched(top, ...moved).join() === top, show);

        fs.mkdirSync(path.join(root, "sub"), { recursive: true });
        const recreated = [top, path.join(top, "p"), root, path.join(root, "sub")];
        await until(
            () => watched(...recreated).join() === recreated.slice(1).join(),
            () => `watched: ${JSON.stringify(watched(...recreated).map(dir => path.relative(top, dir)))}`,
        );
    } finally {
        await watcher[Symbol.asyncDispose]();
    }
    fs.rmSync(top, { recursive: true, force: true });
});

test("an anchor directory moved and re-created at once is watched afresh", {
    skip: process.platform !== "linux" && "Reads inotify state from /proc",
}, async () => {
    const top = tempDir();
    const p = path.join(top, "p");
    const r = path.join(p, "r");
    fs.mkdirSync(p);
    const { watcher, changes } = await start(r);

    try {
        // Same path, new directory: the old anchor watch follows the moved one.
        fs.renameSync(p, path.join(top, "p2"));
        fs.mkdirSync(p);
        await until(() => watched(p).length === 1, () => "The re-created anchor directory is not watched");

        fs.mkdirSync(r);
        await until(() => changes.length > 0, () => "The root's creation was not reported");
        assert.deepEqual(changes, [{ type: "changes", paths: new Set(), subtrees: new Set([r as AbsolutePath]) }]);
        assert.deepEqual(watched(path.join(top, "p2")), []);
    } finally {
        await watcher[Symbol.asyncDispose]();
    }
    fs.rmSync(top, { recursive: true, force: true });
});
