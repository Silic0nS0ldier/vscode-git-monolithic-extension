import test from "ava";
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import { createFakeBackend, type FakeBackend, p } from "../backend/fake.stub.js";
import { gitignore } from "../ignore/gitignore.js";
import type { AbsolutePath } from "../path.js";
import { watch, type Watcher, type WatchEvent, type WatchOptions } from "./mod.js";

const SETTLE = { quiet: 10, maxWait: 1_000 };

function start(fake: FakeBackend, options: Partial<WatchOptions> = {}): Watcher {
    const created = watch({ roots: [p("/repo")], backend: fake, settle: SETTLE, ...options });
    if (isErr(created)) {
        throw new Error(`watch() failed: ${JSON.stringify(unwrap(created))}`);
    }
    return unwrap(created);
}

/** Reads events (without closing the watcher) until one of `type` arrives. */
async function until<T extends WatchEvent["type"]>(
    watcher: Watcher,
    type: T,
): Promise<Extract<WatchEvent, { type: T }>> {
    for (;;) {
        const result = await watcher.next();
        if (result.done) {
            throw new Error(`Watcher closed (${result.value.type}) before a "${type}" event`);
        }
        if (result.value.type === type) {
            return result.value as Extract<WatchEvent, { type: T }>;
        }
    }
}

async function crawled(watcher: Watcher): Promise<void> {
    for (;;) {
        const event = await until(watcher, "crawl");
        if (event.done) {
            return;
        }
    }
}

async function eventually(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("Condition not met in time");
}

function all(event: Extract<WatchEvent, { type: "changes" }>): string[] {
    return sorted(event.paths.union(event.subtrees));
}

/** ava compares sets in insertion order, which concurrent crawling does not guarantee. */
function sorted(set: ReadonlySet<AbsolutePath>): string[] {
    return [...set].sort();
}

test("the initial crawl watches every directory and reports completion", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a/b");
    fake.mkdir("/repo/c");
    await using watcher = start(fake);

    t.is(watcher.state, "crawling");
    await crawled(watcher);
    t.is(watcher.state, "watching");
    t.deepEqual(sorted(fake.watched), ["/repo", "/repo/a", "/repo/a/b", "/repo/c"]);
});

test("a burst of writes is announced by activity then settles into one batch", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.write("/repo/a/1");
    fake.write("/repo/a/2");
    fake.write("/repo/a/1", "again");

    t.is((await watcher.next()).value?.type, "activity");
    const changes = await until(watcher, "changes");
    t.deepEqual(sorted(changes.paths), ["/repo/a/1", "/repo/a/2"]);
});

test("a slow consumer receives accumulated changes without a stale activity event", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.write("/repo/1");
    await new Promise(resolve => setTimeout(resolve, 250));

    const event = await watcher.next();
    t.is(event.value?.type, "changes");
});

test("nested .gitignore files are honoured, including negation and directory patterns", async t => {
    const fake = createFakeBackend();
    fake.write("/repo/.gitignore", "*.log\nbuild/");
    fake.write("/repo/sub/.gitignore", "!keep.log");
    fake.mkdir("/repo/build/deep");
    await using watcher = start(fake, { ignore: gitignore() });
    await crawled(watcher);
    t.false(fake.watched.has(p("/repo/build")));

    fake.write("/repo/x.log");
    fake.write("/repo/sub/keep.log");
    fake.write("/repo/sub/drop.log");
    fake.write("/repo/build/deep/out");

    const changes = await until(watcher, "changes");
    t.deepEqual(changes.paths, new Set([p("/repo/sub/keep.log")]));
});

test("editing a .gitignore re-evaluates its subtree", async t => {
    const fake = createFakeBackend();
    fake.write("/repo/.gitignore", "build/");
    fake.mkdir("/repo/build");
    await using watcher = start(fake, { ignore: gitignore() });
    await crawled(watcher);
    t.false(fake.watched.has(p("/repo/build")));

    fake.write("/repo/.gitignore", "");

    const changes = await until(watcher, "changes");
    t.true(changes.subtrees.has(p("/repo")));
    await eventually(() => fake.watched.has(p("/repo/build")));
    t.pass();
});

test("suspension holds changes back and releases them as one batch", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    await using watcher = start(fake);
    await crawled(watcher);

    const handle = watcher.suspend("checkout");
    t.is(watcher.state, "suspended");
    t.deepEqual((await watcher.next()).value, { type: "suspended", reason: "checkout" });

    fake.write("/repo/1");
    fake.mkdir("/repo/new");
    let delivered = false;
    const next = watcher.next().then(result => {
        delivered = true;
        return result;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    t.false(delivered);
    // Directories created while suspended are still watched, so resuming does not re-crawl.
    await eventually(() => fake.watched.has(p("/repo/new")));

    await handle[Symbol.asyncDispose]();
    t.is((await next).value?.type, "resumed");
    const changes = await until(watcher, "changes");
    t.deepEqual(all(changes), ["/repo/1", "/repo/new"]);
    t.is(fake.watchCalls.get(p("/repo")), 1);
});

test("suspension is reference counted", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    await using watcher = start(fake);
    await crawled(watcher);

    const first = watcher.suspend("a");
    const second = watcher.suspend("b");
    await first[Symbol.asyncDispose]();
    await first[Symbol.asyncDispose]();
    t.is(watcher.state, "suspended");
    await second[Symbol.asyncDispose]();
    t.is(watcher.state, "watching");
});

test("a busy directory collapses into a subtree", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake, { collapseAt: 3 });
    await crawled(watcher);

    for (let i = 0; i < 10; i++) {
        fake.write(`/repo/a/${i}`);
    }
    fake.write("/repo/b");

    const changes = await until(watcher, "changes");
    t.deepEqual(changes.subtrees, new Set([p("/repo/a")]));
    t.deepEqual(changes.paths, new Set([p("/repo/b")]));
});

test("a directory created after the crawl is watched and reported as a subtree", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.mkdir("/repo/new/nested");

    await eventually(() => fake.watched.has(p("/repo/new/nested")));
    const changes = await until(watcher, "changes");
    t.true(changes.subtrees.has(p("/repo/new")));
});

test("a replaced directory is watched again", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.remove("/repo/a");
    fake.mkdir("/repo/a");

    await eventually(() => fake.watchCalls.get(p("/repo/a")) === 2 && fake.watched.has(p("/repo/a")));
    t.pass();
});

test("a deleted directory stops being watched", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a/b");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.remove("/repo/a");

    await eventually(() => !fake.watched.has(p("/repo/a")) && !fake.watched.has(p("/repo/a/b")));
    const changes = await until(watcher, "changes");
    t.true(all(changes).includes("/repo/a"));
});

test("leaving a for await loop closes the watcher and releases every watch", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    const watcher = start(fake);

    for await (const event of watcher) {
        if (event.type === "crawl" && event.done) {
            break;
        }
    }

    t.is(watcher.state, "closed");
    t.deepEqual(await watcher.closed, { type: "disposed" });
    t.is(fake.watched.size, 0);
    t.deepEqual(await watcher.next(), { done: true, value: { type: "disposed" } });
});

test("aborting the signal ends iteration", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    const controller = new AbortController();
    await using watcher = start(fake, { signal: controller.signal });
    await crawled(watcher);

    const pending = watcher.next();
    controller.abort();

    t.deepEqual(await pending, { done: true, value: { type: "aborted" } });
    t.is(fake.watched.size, 0);
});

test("invalid options and an aborted signal are rejected without throwing", t => {
    const fake = createFakeBackend();
    t.deepEqual(
        watch({ roots: [p("/repo")], backend: fake, collapseAt: 0 }),
        [false, { type: "invalid-option", option: "collapseAt", reason: "must be an integer >= 1" }],
    );
    t.deepEqual(watch({ roots: [p("/repo")], backend: fake, signal: AbortSignal.abort() }), [false, {
        type: "aborted",
    }]);
});

test("a missing root is reported as degraded", async t => {
    const fake = createFakeBackend();
    await using watcher = start(fake);

    const event = await until(watcher, "degraded");
    t.is(event.scope, p("/repo"));
    t.is(event.error.type, "watch-failed");
});

test("exhausting the watch limit degrades only the affected subtree", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/ok");
    fake.mkdir("/repo/full/deep");
    fake.failWatch = dir => dir === p("/repo/full") ? "limit" : null;
    await using watcher = start(fake);

    const event = await until(watcher, "degraded");
    t.is(event.scope, p("/repo/full"));
    await crawled(watcher);
    t.deepEqual(sorted(fake.watched), ["/repo", "/repo/ok"]);
});

test("nested roots are watched once", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake, { roots: [p("/repo"), p("/repo/a")] });
    await crawled(watcher);

    t.is(fake.watchCalls.get(p("/repo/a")), 1);
});

test("rescan reports the scope and re-crawls it", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a/b");
    await using watcher = start(fake);
    await crawled(watcher);

    watcher.rescan(p("/repo/a"));

    const changes = await until(watcher, "changes");
    t.deepEqual(changes.subtrees, new Set([p("/repo/a")]));
    await eventually(() => fake.watchCalls.get(p("/repo/a/b")) === 2);
    t.pass();
});
