import test from "ava";
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import { createFakeBackend, type FakeBackend, p } from "../backend/fake.stub.js";
import { gitignore } from "../ignore/gitignore.js";
import type { AbsolutePath } from "../path.js";
import { watch, type Watcher, type WatchEvent, type WatchOptions } from "./mod.js";

const SETTLE = { quiet: 10, maxWait: 1_000 };
const RETRY = { attempts: 3, delay: 1, maxDelay: 4 };

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

/** Records every event in the background. Use instead of `until`, not alongside it. */
function record(watcher: Watcher): WatchEvent[] {
    const events: WatchEvent[] = [];
    void (async () => {
        for (;;) {
            const result = await watcher.next();
            if (result.done) {
                return;
            }
            events.push(result.value);
        }
    })();
    return events;
}

function degraded(events: readonly WatchEvent[]): AbsolutePath[] {
    return events.flatMap(event => event.type === "degraded" ? [event.scope] : []);
}

function changed(events: readonly WatchEvent[]): string[] {
    return sorted(new Set(events.flatMap(event => event.type === "changes" ? all(event) : []) as AbsolutePath[]));
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
    t.deepEqual(sorted(fake.watched), ["/", "/repo", "/repo/a", "/repo/a/b", "/repo/c"]);
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

test("a missing root is watched once created, without reporting an error", async t => {
    const fake = createFakeBackend();
    await using watcher = start(fake);
    const crawl = await until(watcher, "crawl");
    t.deepEqual(crawl, { type: "crawl", directories: 0, done: true });

    fake.mkdir("/repo/a");

    const changes = await until(watcher, "changes");
    t.deepEqual(sorted(changes.subtrees), ["/repo"]);
    await eventually(() => fake.watched.has(p("/repo/a")));
    t.pass();
});

test("a root inside missing directories is watched once created", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/x");
    await using watcher = start(fake, { roots: [p("/x/y/z")] });
    await crawled(watcher);
    t.deepEqual(sorted(fake.watched), ["/x"]);

    fake.mkdir("/x/y");
    await eventually(() => fake.watched.has(p("/x/y")) && !fake.watched.has(p("/x")));
    fake.write("/x/y/z/file");

    const changes = await until(watcher, "changes");
    t.true(all(changes).includes("/x/y/z"));
    await eventually(() => fake.watched.has(p("/x/y/z")));
    t.pass();
});

test("anchors are released as they move, and only the root's parent stays watched", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/x");
    await using watcher = start(fake, { roots: [p("/x/y/z")] });
    await crawled(watcher);
    t.deepEqual(sorted(fake.watched), ["/x"]);

    fake.mkdir("/x/y");
    await eventually(() => fake.watched.has(p("/x/y")));
    t.deepEqual(sorted(fake.watched), ["/x/y"]);

    fake.mkdir("/x/y/z/w");
    await eventually(() => fake.watched.has(p("/x/y/z/w")));
    t.deepEqual(sorted(fake.watched), ["/x/y", "/x/y/z", "/x/y/z/w"]);

    // Removed again: everything below the new anchor is released.
    fake.remove("/x/y");
    await eventually(() => sorted(fake.watched).join() === "/x");
    t.pass();
});

test("unrelated activity next to a missing root is ignored", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/x");
    await using watcher = start(fake, { roots: [p("/x/y/z")] });
    await crawled(watcher);
    const stats = fake.statCalls;

    fake.write("/x/other");
    fake.write("/x/other", "changed");
    fake.mkdir("/x/unrelated/deep");
    fake.remove("/x/other");
    await new Promise(resolve => setTimeout(resolve, 50));

    t.is(fake.statCalls, stats, "no re-check of the root");
    t.deepEqual(sorted(fake.watched), ["/x"]);
    fake.mkdir("/x/y/z");
    // The first batch holds only the root; anything unrelated would have been reported before or with it.
    t.deepEqual(all(await until(watcher, "changes")), ["/x/y/z"]);
});

test("unrelated activity next to a directory root does not re-crawl it", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake);
    await crawled(watcher);
    const stats = fake.statCalls;

    fake.write("/sibling");
    fake.write("/sibling", "changed");
    fake.mkdir("/other/dir");
    fake.remove("/sibling");
    fake.write("/repo/a/file");

    t.deepEqual(all(await until(watcher, "changes")), ["/repo/a/file"]);
    t.is(fake.statCalls, stats);
    t.is(fake.watchCalls.get(p("/repo")), 1);
});

test("a removed root is reported, then watched again once re-created", async t => {
    const fake = createFakeBackend();
    fake.write("/repo/a/file");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.remove("/repo");
    t.deepEqual(sorted((await until(watcher, "changes")).subtrees), ["/repo"]);
    await eventually(() => !fake.watched.has(p("/repo")));

    fake.write("/repo/a/file");
    t.deepEqual(sorted((await until(watcher, "changes")).subtrees), ["/repo"]);
    await eventually(() => fake.watched.has(p("/repo/a")));
    t.pass();
});

test("a replaced root is crawled again", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/old");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.remove("/repo");
    fake.mkdir("/repo/new");

    t.deepEqual(sorted((await until(watcher, "changes")).subtrees), ["/repo"]);
    await eventually(() => fake.watched.has(p("/repo/new")) && !fake.watched.has(p("/repo/old")));
    t.pass();
});

test("a file root reports changes to that file only", async t => {
    const fake = createFakeBackend();
    fake.write("/repo/a");
    fake.write("/repo/b");
    await using watcher = start(fake, { roots: [p("/repo/a")] });
    await crawled(watcher);
    t.deepEqual(sorted(fake.watched), ["/repo"]);

    fake.write("/repo/b", "changed");
    fake.write("/repo/c");
    fake.mkdir("/repo/d");
    fake.remove("/repo/c");
    fake.write("/repo/a", "changed");

    const changes = await until(watcher, "changes");
    t.deepEqual(all(changes), ["/repo/a"]);
});

test("a file root becoming a directory is crawled", async t => {
    const fake = createFakeBackend();
    fake.write("/repo/a");
    await using watcher = start(fake, { roots: [p("/repo/a")] });
    await crawled(watcher);

    fake.remove("/repo/a");
    fake.write("/repo/a/nested");

    t.true(all(await until(watcher, "changes")).includes("/repo/a"));
    await eventually(() => fake.watched.has(p("/repo/a")));
    t.pass();
});

test("a watch that keeps failing is retried a bounded number of times, then reported once as degraded", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/ok");
    fake.mkdir("/repo/full/deep");
    fake.failWatch = dir => dir === p("/repo/full") ? "limit" : null;
    await using watcher = start(fake, { retry: RETRY });

    const events = record(watcher);
    await eventually(() => degraded(events).length > 0);
    t.deepEqual(degraded(events), [p("/repo/full")]);
    t.is(fake.watchAttempts.get(p("/repo/full")), RETRY.attempts + 1);
    t.deepEqual(sorted(fake.watched), ["/", "/repo", "/repo/ok"]);
    await new Promise(resolve => setTimeout(resolve, 50));
    t.is(fake.watchAttempts.get(p("/repo/full")), RETRY.attempts + 1, "no attempts after giving up");

    // An explicit rescan tries again.
    fake.failWatch = null;
    watcher.rescan();
    await eventually(() => fake.watched.has(p("/repo/full/deep")));
    t.pass();
});

test("a watch that fails transiently is retried until it succeeds", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/flaky/deep");
    fake.failWatch = dir => dir === p("/repo/flaky") && fake.watchAttempts.get(dir)! <= 2 ? "limit" : null;
    await using watcher = start(fake, { retry: RETRY });

    const changes = await until(watcher, "changes");
    t.deepEqual(all(changes), ["/repo/flaky"], "reported, as it was unwatched for a while");
    await eventually(() => fake.watched.has(p("/repo/flaky/deep")));
    t.is(fake.watchAttempts.get(p("/repo/flaky")), 3);
});

test("a watch lost after the crawl is re-established, and its directory reported", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a/b");
    await using watcher = start(fake, { retry: RETRY });
    await crawled(watcher);

    fake.breakWatch("/repo/a");

    t.deepEqual(all(await until(watcher, "changes")), ["/repo/a"]);
    await eventually(() => fake.watched.has(p("/repo/a")) && fake.watched.has(p("/repo/a/b")));
    t.is(fake.watchCalls.get(p("/repo/a")), 2);
});

for (
    const [when, breakWatch] of [
        ["while registering", (fake: FakeBackend, dir: AbsolutePath) => fake.breakWatch(dir)],
        ["while listing", (fake: FakeBackend, dir: AbsolutePath) => setImmediate(() => fake.breakWatch(dir))],
    ] as const
) {
    test(`a watch lost during the initial crawl (${when}) is retried after it`, async t => {
        const fake = createFakeBackend();
        fake.mkdir("/repo/a/b/c");
        fake.afterWatch = dir => {
            if (dir === p("/repo/a/b") && fake.watchCalls.get(dir) === 1) {
                breakWatch(fake, dir);
            }
        };
        await using watcher = start(fake, { retry: RETRY });

        await crawled(watcher);
        await eventually(() => fake.watched.has(p("/repo/a/b/c")));
        t.is(fake.watchCalls.get(p("/repo/a/b")), 2);
        t.true(all(await until(watcher, "changes")).includes("/repo/a/b"));
    });
}

test("a watch lost straight after every registration is given up on instead of looping", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    fake.afterWatch = dir => {
        if (dir === p("/repo/a")) {
            setImmediate(() => fake.breakWatch(dir));
        }
    };
    await using watcher = start(fake, { retry: RETRY });

    const events = record(watcher);
    await eventually(() => degraded(events).length > 0);
    await new Promise(resolve => setTimeout(resolve, 50));
    t.deepEqual(degraded(events), [p("/repo/a")]);
    t.is(fake.watchAttempts.get(p("/repo/a")), RETRY.attempts + 1);
});

test("a listing that keeps failing is given up on, and later activity does not retry it", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    fake.failReaddir = dir => dir === p("/repo/a") ? "other" : null;
    await using watcher = start(fake, { retry: RETRY });

    const events = record(watcher);
    await eventually(() => degraded(events).length > 0);
    t.deepEqual(degraded(events), [p("/repo/a")]);
    fake.write("/repo/a/new");
    await new Promise(resolve => setTimeout(resolve, 50));
    t.is(fake.readdirAttempts.get(p("/repo/a")), RETRY.attempts + 1);
});

test("an anchor that keeps failing is given up on, while the root stays watched", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    fake.failWatch = dir => dir === p("/") ? "other" : null;
    await using watcher = start(fake, { retry: RETRY });

    const events = record(watcher);
    await eventually(() => degraded(events).length > 0);
    await new Promise(resolve => setTimeout(resolve, 50));
    t.deepEqual(degraded(events), [p("/repo")]);
    t.is(fake.watchAttempts.get(p("/")), RETRY.attempts + 1);

    fake.write("/repo/file");
    await eventually(() => changed(events).length > 0);
    t.deepEqual(changed(events), ["/repo/file"]);
});

test("a root that vanishes whenever it is watched does not loop", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    // `stat` sees a directory that `watch` cannot find.
    fake.failWatch = dir => dir === p("/repo") ? "not-found" : null;
    await using watcher = start(fake, { retry: RETRY });

    const events = record(watcher);
    await eventually(() => degraded(events).length > 0);
    await new Promise(resolve => setTimeout(resolve, 50));
    t.deepEqual(degraded(events), [p("/repo")]);
    t.is(fake.watchAttempts.get(p("/repo")), RETRY.attempts + 1);
});

test("a nameless event next to a root re-crawls it, as it may have been replaced", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.emitNameless("/");

    t.deepEqual(all(await until(watcher, "changes")), ["/repo"]);
    await eventually(() => fake.watchCalls.get(p("/repo/a")) === 2);
    t.pass();
});

test("a removed anchor moves up instead of going quiet", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/x");
    await using watcher = start(fake, { roots: [p("/x/y/z")] });
    await crawled(watcher);

    fake.remove("/x");
    await eventually(() => fake.watched.has(p("/")));
    fake.mkdir("/x/y/z");

    t.deepEqual(all(await until(watcher, "changes")), ["/x/y/z"]);
});

test("a retry watches the directory that replaced the one that failed", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a/b");
    fake.failWatch = dir => dir === p("/repo/a/b") && fake.watchAttempts.get(dir) === 1 ? "limit" : null;
    await using watcher = start(fake, { retry: { attempts: 3, delay: 50, maxDelay: 50 } });
    await crawled(watcher);

    // Replaced while the retry is pending; the replacement skips the path until then.
    fake.remove("/repo/a");
    fake.mkdir("/repo/a/b/c");

    await eventually(() => fake.watched.has(p("/repo/a/b/c")));
    t.pass();
});

test("an anchor retry repairs whichever anchor is current", async t => {
    const fake = createFakeBackend();
    await using watcher = start(fake, { roots: [p("/x/y/z")], retry: { attempts: 3, delay: 50, maxDelay: 50 } });
    await crawled(watcher);

    // The anchor moves to /x while the old one's retry is pending, then the new one is lost too.
    fake.mkdir("/x");
    fake.breakWatch("/");
    await eventually(() => fake.watched.has(p("/x")));
    fake.breakWatch("/x");

    await eventually(() => fake.watched.has(p("/x")));
    fake.mkdir("/x/y/z");
    t.deepEqual(all(await until(watcher, "changes")), ["/x/y/z"]);
});

test("events next to a failing root do not add attempts", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    fake.failWatch = dir => dir === p("/repo") ? "limit" : null;
    await using watcher = start(fake, { retry: RETRY });
    const events = record(watcher);

    for (let i = 0; i < 20; i++) {
        fake.emitNameless("/");
        await new Promise(resolve => setImmediate(resolve));
    }
    await eventually(() => degraded(events).length > 0);
    for (let i = 0; i < 20; i++) {
        fake.emitNameless("/");
    }
    await new Promise(resolve => setTimeout(resolve, 50));

    t.is(fake.watchAttempts.get(p("/repo")), RETRY.attempts + 1);
    t.deepEqual(degraded(events), [p("/repo")]);
});

test("a stat that keeps failing is given up on", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    fake.failStat = target => target === p("/repo") ? "other" : null;
    await using watcher = start(fake, { retry: RETRY });
    const events = record(watcher);

    await eventually(() => degraded(events).length > 0);
    const stats = fake.statCalls;
    await new Promise(resolve => setTimeout(resolve, 50));

    t.is(fake.statCalls, stats);
    t.deepEqual(degraded(events), [p("/repo")]);
});

test("a path given up on is tried again by activity after the cooldown", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    fake.failReaddir = dir => dir === p("/repo/a") ? "other" : null;
    await using watcher = start(fake, { retry: { attempts: 1, delay: 1, maxDelay: 1, cooldown: 200 } });
    const events = record(watcher);
    await eventually(() => degraded(events).length === 1);
    t.is(fake.readdirAttempts.get(p("/repo/a")), 2);

    await new Promise(resolve => setTimeout(resolve, 250));
    fake.write("/repo/a/new");

    await eventually(() => degraded(events).length === 2);
    t.is(fake.readdirAttempts.get(p("/repo/a")), 4);
});

test("a retry that is slower to fail than the cooldown still counts towards the same streak", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    fake.failReaddir = dir => dir === p("/repo/a") ? "other" : null;
    fake.readdirDelay = dir => dir === p("/repo/a") ? 40 : 0;
    await using watcher = start(fake, { retry: { attempts: 2, delay: 1, maxDelay: 1, cooldown: 20 } });
    const events = record(watcher);

    await eventually(() => degraded(events).length === 1);
    await new Promise(resolve => setTimeout(resolve, 100));

    t.is(fake.readdirAttempts.get(p("/repo/a")), 3);
    t.deepEqual(degraded(events), [p("/repo/a")]);
});

test("a root that keeps failing to list is given up on, though checking it succeeds", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    fake.failReaddir = dir => dir === p("/repo") ? "other" : null;
    fake.readdirDelay = dir => dir === p("/repo") ? 40 : 0;
    await using watcher = start(fake, { retry: { attempts: 2, delay: 1, maxDelay: 1, cooldown: 20 } });
    const events = record(watcher);

    await eventually(() => degraded(events).length === 1);
    await new Promise(resolve => setTimeout(resolve, 100));

    t.is(fake.readdirAttempts.get(p("/repo")), 3);
});

test("an anchor lost while registering is not counted as working", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo");
    fake.afterWatch = dir => {
        if (dir === p("/")) {
            fake.breakWatch(dir);
        }
    };
    await using watcher = start(fake, { retry: { attempts: 2, delay: 30, maxDelay: 30, cooldown: 1 } });
    const events = record(watcher);

    await eventually(() => degraded(events).length === 1);
    await new Promise(resolve => setTimeout(resolve, 100));

    t.is(fake.watchAttempts.get(p("/")), 3);
    t.deepEqual(degraded(events), [p("/repo")]);
});

test("failures far enough apart do not add up", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake, { retry: { attempts: 1, delay: 1, maxDelay: 1, cooldown: 30 } });
    const events = record(watcher);
    await eventually(() => events.some(event => event.type === "crawl" && event.done));

    for (let i = 2; i <= 4; i++) {
        fake.breakWatch("/repo/a");
        await eventually(() => fake.watchCalls.get(p("/repo/a")) === i);
        await new Promise(resolve => setTimeout(resolve, 60));
    }
    t.deepEqual(degraded(events), []);
});

test("resuming keeps retrying until failures recover or run out of attempts", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake, { retry: { attempts: 3, delay: 10_000, maxDelay: 10_000 } });
    await crawled(watcher);

    const handle = watcher.suspend("checkout");
    fake.breakWatch("/repo/a");
    // The first two attempts at re-watching fail too.
    fake.failWatch = dir => dir === p("/repo/a") && fake.watchAttempts.get(dir)! <= 3 ? "limit" : null;
    await handle[Symbol.asyncDispose]();

    t.true(fake.watched.has(p("/repo/a")));
    t.is(fake.watchAttempts.get(p("/repo/a")), 4);
});

test("resuming retries failures now rather than waiting for their backoff", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake, { retry: { attempts: 3, delay: 10_000, maxDelay: 10_000 } });
    await crawled(watcher);

    const handle = watcher.suspend("checkout");
    fake.breakWatch("/repo/a");
    t.false(fake.watched.has(p("/repo/a")));
    await handle[Symbol.asyncDispose]();

    t.true(fake.watched.has(p("/repo/a")));
});

test("a nameless event in a directory lists it again without re-watching", async t => {
    const fake = createFakeBackend();
    fake.mkdir("/repo/a");
    await using watcher = start(fake);
    await crawled(watcher);

    fake.emitNameless("/repo/a");

    t.deepEqual(all(await until(watcher, "changes")), ["/repo/a"]);
    t.is(fake.readdirAttempts.get(p("/repo/a")), 2);
    t.is(fake.watchCalls.get(p("/repo/a")), 1);
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
