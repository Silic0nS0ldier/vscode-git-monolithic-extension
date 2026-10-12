/**
 * The test suite of `watcher` v2.3.1 (https://github.com/fabiospampinato/watcher/blob/v2.3.1/test/index.js),
 * run against sauron and `watcher` side by side on a real file system. Test names are kept verbatim.
 *
 * sauron reports which paths changed, not event types, so each expected `add`/`change`/`unlink` becomes "this
 * path is reported" (directly, or within a reported subtree). Beyond those expectations every scenario checks
 * parity: sauron must cover everything `watcher` reports, and may only report more where the scenario says why.
 */
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import BaseWatcher from "watcher";
import { type AbsolutePath, absolutePath, type Ignorer, join, watch, type Watcher, type WatchEvent } from "../mod.js";
import { isWithin } from "../path.js";

/** `watcher`'s test tree. */
const BLUEPRINT = [
    "home/a/file1",
    "home/a/file2",
    "home/b/file1",
    "home/b/file2",
    "home/e/sub/file1",
    "home/e/file1",
    "home/e/file2",
    "home/shallow/1/2/file1",
    "home/shallow/1/2/file2",
    "home/deep/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/file1",
    "home/deep/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/file2",
    "home/empty/",
];

/** Debounce for both, as in `watcher`'s deduplication tests. Steps within a phase are at most 100 ms apart. */
const DEBOUNCE_MS = 300;
/** Silence from both watchers after which a phase is over. */
const IDLE_MS = 1_000;
const TIMEOUT_MS = 20_000;

const STAT_BLIND =
    "`watcher` compares stats, so a replacement with identical ones (inode reused, same size and mtime) can go unreported";
const CONSERVATIVE =
    "The entry was replaced, even if by itself. sauron reports it rather than compare identities; git checks it too, as replacing changes ctime";

type Expect = {
    /** Must be reported by sauron, directly or within a reported subtree. */
    readonly reported?: readonly string[];
    /** Must not be reported by sauron. */
    readonly unreported?: readonly string[];
    /** sauron must report nothing. */
    readonly nothing?: boolean;
    /** Number of sauron batches. */
    readonly batches?: number;
    /** May be reported by sauron but not by `watcher`, and why that is right. */
    readonly sauronOnly?: { readonly paths: readonly string[]; readonly reason: string };
    /** Why parity is not checked. */
    readonly skipParity?: string;
};

type StartOptions = {
    readonly ignore?: RegExp;
    /** Runs once sauron has started crawling. */
    readonly duringCrawl?: () => void;
};

type Context = {
    readonly sauron: Watcher;
    /** Every sauron event since start, with `performance.now()` of arrival. */
    readonly events: readonly (readonly [number, WatchEvent])[];
    start(roots: string | readonly string[], options?: StartOptions): Promise<void>;
    newFile(target: string, delay?: number): void;
    newFiles(dir: string, count: number): string[];
    newDir(target: string, delay?: number): void;
    newDirs(dir: string, count: number): string[];
    modify(target: string, delay?: number): void;
    touch(target: string): void;
    remove(target: string, delay?: number): void;
    rename(from: string, to: string): void;
    copy(from: string, to: string): void;
    /** Waits for both watchers to go quiet, then checks what each reported since the previous call. */
    settled(expect: Expect): Promise<void>;
    closeWatchers(): Promise<void>;
};

const TMP = process.env["TEST_TMPDIR"] ?? os.tmpdir();

function abs(raw: string): AbsolutePath {
    const result = absolutePath(raw);
    if (isErr(result)) {
        throw new Error(`Not absolute: ${raw}`);
    }
    return unwrap(result);
}

function ignoreMatching(pattern: RegExp): Ignorer {
    return {
        visit: dir => ({ ignored: new Set(dir.entries.keys().filter(name => pattern.test(join(dir.path, name)))) }),
    };
}

function covers(paths: ReadonlySet<string>, subtrees: ReadonlySet<string>, target: string): boolean {
    return paths.has(target) || subtrees.has(target)
        || subtrees.values().some(dir => isWithin(target as AbsolutePath, dir as AbsolutePath));
}

async function until(condition: () => boolean, deadline: number): Promise<void> {
    while (!condition() && performance.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

async function createContext(): Promise<Context & AsyncDisposable> {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(TMP, "parity-")));
    for (const entry of BLUEPRINT) {
        const target = path.join(root, entry);
        fs.mkdirSync(entry.endsWith("/") ? target : path.dirname(target), { recursive: true });
        if (!entry.endsWith("/")) {
            fs.writeFileSync(target, "");
        }
    }
    const resolve = (relative: string): string => path.join(root, relative);
    const relative = (target: string): string => path.relative(root, target);

    let sauron: Watcher | null = null;
    let baseWatcher: BaseWatcher | null = null;
    const events: [number, WatchEvent][] = [];
    let paths = new Set<string>();
    let subtrees = new Set<string>();
    let batches = 0;
    let reportedByWatcher = new Set<string>();
    let lastActivity = performance.now();
    const scheduled: Promise<void>[] = [];

    function act(operation: () => void, delay = 0): void {
        if (delay === 0) {
            operation();
            lastActivity = performance.now();
            return;
        }
        scheduled.push(
            new Promise(done =>
                setTimeout(() => {
                    operation();
                    lastActivity = performance.now();
                    done();
                }, delay)
            ),
        );
    }

    function create(dir: string, count: number, make: (target: string) => void): string[] {
        return Array.from({ length: count }, (_, i) => {
            const target = path.join(dir, `new_${i}`);
            make(resolve(target));
            return target;
        });
    }

    const context: Context & AsyncDisposable = {
        get sauron() {
            assert.ok(sauron !== null, "start() first");
            return sauron;
        },
        events,
        async start(roots, options = {}) {
            const targets = (typeof roots === "string" ? [roots] : roots).map(resolve);
            const created = watch({
                roots: targets.map(abs) as [AbsolutePath, ...AbsolutePath[]],
                settle: { quiet: DEBOUNCE_MS, maxWait: 10_000 },
                ...(options.ignore === undefined ? {} : { ignore: ignoreMatching(options.ignore) }),
            });
            assert.ok(!isErr(created), "watch() failed");
            const watcher = unwrap(created);
            sauron = watcher;
            const crawled = Promise.withResolvers<void>();
            let duringCrawl = options.duringCrawl;
            void (async () => {
                for (;;) {
                    const result = await watcher.next();
                    if (result.done) {
                        crawled.resolve();
                        return;
                    }
                    const event = result.value;
                    events.push([performance.now(), event]);
                    if (event.type === "crawl") {
                        duringCrawl?.();
                        duringCrawl = undefined;
                        if (event.done) {
                            crawled.resolve();
                        }
                    } else if (event.type === "changes") {
                        paths = paths.union(event.paths);
                        subtrees = subtrees.union(event.subtrees);
                        batches++;
                        lastActivity = performance.now();
                    } else if (event.type === "activity") {
                        lastActivity = performance.now();
                    }
                }
            })();

            // Configured like the extension, plus `watcher`'s own test settings.
            const base = new BaseWatcher(
                targets,
                {
                    debounce: DEBOUNCE_MS,
                    ignoreInitial: true,
                    recursive: true,
                    pollingInterval: 100,
                    ...(options.ignore === undefined
                        ? {}
                        : { ignore: (target: string) => options.ignore!.test(target) }),
                },
                (_event, target) => {
                    reportedByWatcher.add(target);
                    lastActivity = performance.now();
                },
            );
            baseWatcher = base;
            const ready = new Promise<void>(done => base.on("ready", () => done()));
            await Promise.all([crawled.promise, ready]);
        },
        newFile(target, delay) {
            act(() => {
                fs.mkdirSync(path.dirname(resolve(target)), { recursive: true });
                fs.writeFileSync(resolve(target), "");
            }, delay);
        },
        newFiles: (dir, count) => create(dir, count, target => fs.writeFileSync(target, "")),
        newDir(target, delay) {
            act(() => fs.mkdirSync(resolve(target), { recursive: true }), delay);
        },
        newDirs: (dir, count) => create(dir, count, target => fs.mkdirSync(target, { recursive: true })),
        modify(target, delay) {
            act(() => fs.appendFileSync(resolve(target), "content"), delay);
        },
        touch(target) {
            act(() => fs.closeSync(fs.openSync(resolve(target), "a")));
        },
        remove(target, delay) {
            act(() => fs.rmSync(resolve(target), { recursive: true, force: true }), delay);
        },
        rename(from, to) {
            act(() => fs.renameSync(resolve(from), resolve(to)));
        },
        copy(from, to) {
            act(() => fs.cpSync(resolve(from), resolve(to), { recursive: true }));
        },
        async settled(expect) {
            await Promise.all(scheduled.splice(0));
            const deadline = performance.now() + TIMEOUT_MS;
            const expected = (expect.reported ?? []).map(resolve);
            await until(() => expected.every(target => covers(paths, subtrees, target)), deadline);
            await until(() => performance.now() - lastActivity >= IDLE_MS, deadline);

            const s = { paths, subtrees, batches };
            const w = reportedByWatcher;
            paths = new Set();
            subtrees = new Set();
            batches = 0;
            reportedByWatcher = new Set();

            const show = () =>
                `sauron paths ${JSON.stringify([...s.paths].map(relative).sort())}, subtrees ${
                    JSON.stringify([...s.subtrees].map(relative).sort())
                }; watcher ${JSON.stringify([...w].map(relative).sort())}`;
            for (const target of expected) {
                assert.ok(covers(s.paths, s.subtrees, target), `"${relative(target)}" not reported. ${show()}`);
            }
            for (const target of (expect.unreported ?? []).map(resolve)) {
                assert.ok(!covers(s.paths, s.subtrees, target), `"${relative(target)}" reported. ${show()}`);
            }
            if (expect.nothing === true) {
                assert.equal(s.paths.size + s.subtrees.size, 0, `Expected nothing. ${show()}`);
            }
            if (expect.batches !== undefined) {
                assert.equal(s.batches, expect.batches, `Batches. ${show()}`);
            }
            if (expect.skipParity === undefined) {
                const allowed = new Set((expect.sauronOnly?.paths ?? []).map(resolve));
                const missed = [...w].filter(target => !covers(s.paths, s.subtrees, target));
                const extra = [
                    ...[...s.paths].filter(target => !w.has(target)),
                    ...[...s.subtrees].filter(dir =>
                        !w.has(dir) && !w.values().some(target => isWithin(target as AbsolutePath, dir as AbsolutePath))
                    ),
                ].filter(target => !allowed.has(target));
                assert.deepEqual(missed.map(relative), [], `sauron missed what watcher reported. ${show()}`);
                assert.deepEqual(extra.map(relative), [], `sauron reported more than watcher. ${show()}`);
            }
        },
        async closeWatchers() {
            await sauron?.[Symbol.asyncDispose]();
            baseWatcher?.close();
        },
        async [Symbol.asyncDispose]() {
            await context.closeWatchers();
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
    return context;
}

function scenario(name: string, body: (t: Context) => Promise<void>): void {
    it(name, async () => {
        await using context = await createContext();
        await body(context);
    });
}

function notApplicable(name: string, reason: string): void {
    it(name, { skip: reason }, () => {});
}

const NO_INITIAL = "sauron emits no initial events; the `crawl` event marks when the initial state is known";
const NO_DEPTH = "sauron has no depth limit (`watcher` stops at 20 levels); see the depth scenario below";
const NO_NON_RECURSIVE = "sauron always watches directories recursively, as the extension does";

describe("watcher parity", () => {
    describe("watching files", { concurrency: true }, () => {
        scenario("should watch a single non-existent file inside a directory", async t => {
            const file = "home/a/file_missing";
            await t.start(file);
            await t.settled({ nothing: true });
            t.newFile(file);
            await t.settled({ reported: [file] });
            t.remove(file);
            await t.settled({ reported: [file] });
            t.newFile(file);
            await t.settled({ reported: [file] });
            t.modify(file);
            await t.settled({ reported: [file] });
        });

        scenario("should watch a single non-existent file inside a non-existent directory", async t => {
            const dir = "home/a/dir_missing";
            const file = `${dir}/file_missing`;
            await t.start(file);
            await t.settled({ nothing: true });
            t.newFile(file);
            await t.settled({ reported: [file] });
            t.remove(dir);
            await t.settled({ reported: [file] });
            t.newFile(file);
            await t.settled({ reported: [file] });
            t.modify(file);
            await t.settled({ reported: [file] });
        });

        scenario("should watch a single file", async t => {
            await t.start("home/a/file1");
            for (const delay of [0, 100, 200]) {
                t.modify("home/a/file1", delay);
                t.modify("home/a/file2", delay);
            }
            await t.settled({ reported: ["home/a/file1"], unreported: ["home/a/file2"] });
        });

        scenario("should watch multiple files", async t => {
            await t.start(["home/a/file1", "home/a/file2"]);
            t.modify("home/a/file1");
            t.modify("home/a/file2", 100);
            await t.settled({ reported: ["home/a/file1", "home/a/file2"] });
        });

        scenario("should watch all files inside a directory", async t => {
            await t.start("home/a");
            t.modify("home/a/file1");
            t.modify("home/a/file2", 100);
            await t.settled({ reported: ["home/a/file1", "home/a/file2"] });
        });

        scenario("should watch new files inside a directory", async t => {
            await t.start("home/a");
            t.newFile("home/a/newfile1");
            t.newFile("home/a/newfile2");
            await t.settled({ reported: ["home/a/newfile1", "home/a/newfile2"] });
        });

        scenario("should watch new files inside an initially empty directory", async t => {
            await t.start("home/empty");
            t.newFile("home/empty/newfile1");
            t.newFile("home/empty/newfile2");
            await t.settled({ reported: ["home/empty/newfile1", "home/empty/newfile2"] });
        });

        scenario("should watch new files inside a new directory", async t => {
            await t.start("home/a");
            t.newFile("home/a/newdir/newfile1");
            t.newFile("home/a/newdir/newfile2");
            await t.settled({ reported: ["home/a/newdir", "home/a/newdir/newfile1", "home/a/newdir/newfile2"] });
        });

        scenario("should watch all files inside a deep directory", async t => {
            await t.start("home");
            t.modify("home/a/file1");
            t.modify("home/a/file2", 100);
            await t.settled({ reported: ["home/a/file1", "home/a/file2"] });
        });

        scenario("should watch new files inside a deep directory", async t => {
            await t.start("home");
            t.newFile("home/a/newfile1");
            t.newFile("home/a/newfile2");
            await t.settled({ reported: ["home/a/newfile1", "home/a/newfile2"] });
        });

        scenario("should watch new files inside an initially empty deep directory", async t => {
            await t.start("home");
            t.newFile("home/empty/newfile1");
            t.newFile("home/empty/newfile2");
            await t.settled({ reported: ["home/empty/newfile1", "home/empty/newfile2"] });
        });

        scenario("should watch (touched) new files inside an initially empty deep directory", async t => {
            await t.start("home");
            t.touch("home/empty/newfile1");
            t.touch("home/empty/newfile2");
            await t.settled({ reported: ["home/empty/newfile1", "home/empty/newfile2"] });
        });

        scenario("should watch new files inside a new deep directory", async t => {
            await t.start("home");
            t.newFile("home/a/newdir/newfile1");
            t.newFile("home/a/newdir/newfile2");
            await t.settled({ reported: ["home/a/newdir", "home/a/newdir/newfile1", "home/a/newdir/newfile2"] });
        });

        scenario("should deduplicate events", async t => {
            await t.start("home/a/file2");
            for (const delay of [0, 50, 100]) {
                t.modify("home/a/file2", delay);
            }
            await t.settled({ reported: ["home/a/file2"], batches: 1 });
        });

        scenario("should deduplicate events inside a directory", async t => {
            await t.start("home/a");
            for (const delay of [0, 50, 100]) {
                t.modify("home/a/file1", delay);
            }
            await t.settled({ reported: ["home/a/file1"], batches: 1 });
        });

        scenario("should deduplicate events inside a deep directory", async t => {
            await t.start("home");
            for (const delay of [0, 50, 100]) {
                t.modify("home/a/file1", delay);
            }
            await t.settled({ reported: ["home/a/file1"], batches: 1 });
        });
    });

    describe("watching directories", { concurrency: true }, () => {
        scenario("should watch a single non-existent directory inside a directory", async t => {
            const dir = "home/a/dir_missing";
            await t.start(dir);
            await t.settled({ nothing: true });
            t.newDir(dir);
            await t.settled({ reported: [dir] });
            t.remove(dir);
            await t.settled({ reported: [dir] });
            t.newDir(dir);
            await t.settled({ reported: [dir] });
        });

        scenario("should watch a single non-existent directory inside a non-existent directory", async t => {
            const parent = "home/a/dir_missing";
            const dir = `${parent}/dir_missing`;
            await t.start(dir);
            await t.settled({ nothing: true });
            t.newDir(dir);
            await t.settled({ reported: [dir] });
            t.remove(parent);
            await t.settled({ reported: [dir] });
            t.newDir(dir);
            await t.settled({ reported: [dir] });
        });

        scenario("should watch new directories inside a directory", async t => {
            await t.start("home/a");
            t.newDir("home/a/dir1");
            t.newDir("home/a/dir2");
            await t.settled({ reported: ["home/a/dir1", "home/a/dir2"] });
        });

        scenario("should watch new directories inside an initially empty directory", async t => {
            await t.start("home/empty");
            t.newDir("home/empty/dir1");
            t.newDir("home/empty/dir2");
            await t.settled({ reported: ["home/empty/dir1", "home/empty/dir2"] });
        });

        scenario("should watch new directories inside a new directory", async t => {
            await t.start("home/a");
            t.newDir("home/a/newdir/newdir1");
            t.newDir("home/a/newdir/newdir2");
            await t.settled({ reported: ["home/a/newdir", "home/a/newdir/newdir1", "home/a/newdir/newdir2"] });
        });

        scenario("should watch new directories inside a deep directory", async t => {
            await t.start("home");
            t.newDir("home/a/dir1");
            t.newDir("home/a/dir2");
            await t.settled({ reported: ["home/a/dir1", "home/a/dir2"] });
        });

        scenario("should watch new directories inside an initially empty deep directory", async t => {
            await t.start("home");
            t.newDir("home/empty/dir1");
            t.newDir("home/empty/dir2");
            await t.settled({ reported: ["home/empty/dir1", "home/empty/dir2"] });
        });

        scenario("should watch new directories inside a new deep directory", async t => {
            await t.start("home");
            t.newDir("home/a/newdir/newdir1");
            t.newDir("home/a/newdir/newdir2");
            await t.settled({ reported: ["home/a/newdir", "home/a/newdir/newdir1", "home/a/newdir/newdir2"] });
        });

        for (const [name, root] of [["inside a directory", "home/a"], ["inside a deep directory", "home"]]) {
            scenario(`should deduplicate events ${name}`, async t => {
                await t.start(root!);
                t.newDir("home/a/newdir1");
                t.newDir("home/a/newdir2");
                t.remove("home/a/newdir1", 50);
                t.remove("home/a/newdir2", 50);
                t.newDir("home/a/newdir1", 100);
                t.newDir("home/a/newdir2", 100);
                await t.settled({ reported: ["home/a/newdir1", "home/a/newdir2"], batches: 1 });
            });
        }

        scenario("should keep watching after removal of sub directory", async t => {
            await t.start("home");
            t.remove("home/e/sub", 50);
            t.modify("home/e/file1", 100);
            t.modify("home/e/file2", 150);
            await t.settled({ reported: ["home/e/sub/file1", "home/e/sub", "home/e/file1", "home/e/file2"] });
        });

        scenario(
            "should close all eventual additional watchers added for recursiong when no longer needed",
            async t => {
                // Releasing the watches themselves is checked by the unit tests ("a deleted directory stops being watched").
                await t.start("home/a");
                t.newDir("home/a/sub1/sub2");
                await t.settled({ reported: ["home/a/sub1", "home/a/sub1/sub2"] });
                t.remove("home/a/sub1/sub2");
                await t.settled({ reported: ["home/a/sub1/sub2"] });
                t.remove("home/a/sub1");
                await t.settled({ reported: ["home/a/sub1"] });
            },
        );
    });

    describe("file events", { concurrency: true }, () => {
        notApplicable("should detect initial \"add\" for a single file", NO_INITIAL);
        notApplicable("should detect initial \"add\" for multiple files", NO_INITIAL);
        notApplicable("should detect initial \"add\" for all files inside a directory", NO_INITIAL);
        notApplicable("should detect initial \"add\" for all files inside a deep directory", NO_INITIAL);

        scenario("should detect \"add\" when creating a new file inside a directory", async t => {
            await t.start("home/a");
            t.newFile("home/a/file1_new");
            await t.settled({ reported: ["home/a/file1_new"] });
        });

        for (const [name, root] of [["a new directory", "home/a"], ["a new deep directory", "home"]]) {
            scenario(`should detect "add" when creating a new file inside ${name}`, async t => {
                await t.start(root!);
                t.newFile("home/a/newdir/file1");
                await t.settled({ reported: ["home/a/newdir/file1"] });
            });
        }

        for (const [name, root] of [["a directory", "home/a"], ["a deep directory", "home"]]) {
            scenario(`should detect "add" when copying a file inside ${name}`, async t => {
                await t.start(root!);
                t.copy("home/a/file1", "home/a/file1_copy");
                await t.settled({ reported: ["home/a/file1_copy"] });
            });
        }

        for (const [name, root] of [["a parent directory", "home/e"], ["a deep parent directory", "home"]]) {
            scenario(`should detect "add" when copying ${name}`, async t => {
                await t.start(root!);
                t.copy("home/e/sub", "home/e/sub_copy");
                await t.settled({ reported: ["home/e/sub_copy/file1"] });
            });
        }

        for (const [name, root] of [["a directory", "home/a"], ["a deep directory", "home"]]) {
            scenario(`should detect "change" when modifying a file inside ${name}`, async t => {
                await t.start(root!);
                t.modify("home/a/file1");
                await t.settled({ reported: ["home/a/file1"] });
            });
        }

        scenario("should detect \"change\" when renaming a non-empty file and rerenaming it", async t => {
            await t.start("home/a");
            t.modify("home/a/file1");
            t.rename("home/a/file1", "home/a/file1_alt");
            t.rename("home/a/file1_alt", "home/a/file1");
            await t.settled({ reported: ["home/a/file1"], unreported: ["home/a/file1_alt"] });
        });

        scenario("should detect \"unlink\" when removing a single file", async t => {
            await t.start("home/a/file1");
            t.remove("home/a/file1");
            await t.settled({ reported: ["home/a/file1"] });
        });

        scenario(
            "should detect \"unlink\" and \"add\" when removing a single file and much later recreating it",
            async t => {
                await t.start("home/a/file1");
                t.remove("home/a/file1");
                await t.settled({ reported: ["home/a/file1"] });
                t.newFile("home/a/file1");
                await t.settled({ reported: ["home/a/file1"] });
            },
        );

        for (const [name, root] of [["a directory", "home/a"], ["a deep directory", "home"]]) {
            scenario(`should detect "unlink" when removing a file inside ${name}`, async t => {
                await t.start(root!);
                t.remove("home/a/file1");
                await t.settled({ reported: ["home/a/file1"] });
            });
        }

        scenario("should detect \"unlink\" when removing a parent directory", async t => {
            await t.start("home");
            t.remove("home/a");
            await t.settled({ reported: ["home/a/file1", "home/a/file2"] });
        });

        scenario("should detect \"unlink\" when removing a parent directory of the watcher", async t => {
            await t.start("home/e/sub");
            t.remove("home/e");
            await t.settled({ reported: ["home/e/sub/file1"] });
        });

        for (const [name, root] of [["a directory", "home/a"], ["a deep directory", "home"]]) {
            scenario(`should detect "unlink" and "add" when renaming a file inside ${name}`, async t => {
                await t.start(root!);
                t.rename("home/a/file1", "home/a/file1_alt");
                await t.settled({ reported: ["home/a/file1", "home/a/file1_alt"] });
            });
        }

        scenario("should detect \"unlink\" and \"add\" when renaming a parent directory", async t => {
            await t.start("home");
            t.rename("home/a", "home/a_alt");
            await t.settled({
                reported: ["home/a/file1", "home/a_alt/file1", "home/a/file2", "home/a_alt/file2"],
            });
        });

        scenario("should detect a single \"add\" when creating a new file and modifying it", async t => {
            await t.start("home/a");
            t.newFile("home/a/file1_new");
            t.modify("home/a/file1_new");
            await t.settled({ reported: ["home/a/file1_new"], batches: 1 });
        });

        scenario("should detect a single \"change\" when removing a file and creating it", async t => {
            await t.start("home/a");
            t.remove("home/a/file1");
            t.newFile("home/a/file1");
            await t.settled({
                reported: ["home/a/file1"],
                batches: 1,
                sauronOnly: { paths: ["home/a/file1"], reason: STAT_BLIND },
            });
        });

        scenario("should detect a single \"unlink\" when modifying a file and removing it", async t => {
            await t.start("home/a");
            t.modify("home/a/file1");
            t.remove("home/a/file1");
            await t.settled({ reported: ["home/a/file1"], batches: 1 });
        });

        scenario("should detect nothing when creating a new file and removing it", async t => {
            await t.start("home/a");
            t.newFile("home/a/file1_new");
            t.remove("home/a/file1_new");
            await t.settled({ nothing: true });
        });

        scenario("should detect nothing when renaming an empty file and rerenaming it", async t => {
            await t.start("home/a");
            t.rename("home/a/file1", "home/a/file1_alt");
            t.rename("home/a/file1_alt", "home/a/file1");
            await t.settled({
                reported: ["home/a/file1"],
                unreported: ["home/a/file1_alt"],
                sauronOnly: { paths: ["home/a/file1"], reason: CONSERVATIVE },
            });
        });

        scenario("should detect nothing when renaming a parent directory and rerenaming it", async t => {
            await t.start("home/a");
            t.rename("home/a", "home/a_alt");
            t.rename("home/a_alt", "home/a");
            await t.settled({
                unreported: ["home/a_alt"],
                sauronOnly: { paths: ["home/a"], reason: CONSERVATIVE },
            });
        });

        scenario("should detect \"unlink\" when removing a file and creating a directory of the same name", async t => {
            await t.start("home/a");
            t.remove("home/a/file1");
            t.newDir("home/a/file1");
            await t.settled({ reported: ["home/a/file1"] });
        });

        scenario("should detect \"add\" when removing a directory and creating a file of the same name", async t => {
            await t.start("home");
            t.remove("home/a");
            t.newFile("home/a");
            await t.settled({ reported: ["home/a"] });
        });

        scenario(
            "should detect \"change\" when replacing a parent directory with another one of the same name",
            async t => {
                await t.start("home");
                t.remove("home/a");
                t.copy("home/b", "home/a");
                await t.settled({ reported: ["home/a/file1", "home/a/file2"] });
            },
        );

        scenario("should be able to handle many \"unlink\" events", async t => {
            const files = t.newFiles("home/a", 100);
            await t.start("home/a");
            for (const file of files) {
                t.remove(file);
            }
            await t.settled({ reported: files });
        });
    });

    describe("file events (with renames)", () => {
        notApplicable(
            "every test",
            "The extension runs `watcher` with `renameDetection: false`, so renames are reported as both paths (see above)",
        );
    });

    describe("directory events", { concurrency: true }, () => {
        notApplicable("should detect initial \"addDir\" for a single directory", NO_INITIAL);
        notApplicable("should detect initial \"addDir\" for multiple directories", NO_INITIAL);
        notApplicable("should detect initial \"addDir\" for directories inside a directory", NO_INITIAL);
        notApplicable("should detect initial \"addDir\" for directories inside a deep directory", NO_INITIAL);

        scenario("should detect \"addDir\" when creating a new directory inside a directory", async t => {
            await t.start("home/a");
            t.newDir("home/a/dir");
            await t.settled({ reported: ["home/a/dir"] });
        });

        for (const [name, root] of [["a new directory", "home/a"], ["a new deep directory", "home"]]) {
            scenario(`should detect "addDir" when creating a new directory inside ${name}`, async t => {
                await t.start(root!);
                t.newDir("home/a/dir1/dir2");
                await t.settled({ reported: ["home/a/dir1", "home/a/dir1/dir2"] });
            });
        }

        for (
            const [name, root] of [
                ["a directory inside a directory", "home/e"],
                ["a directory inside a deep directory", "home"],
                ["a parent directory", "home/e"],
            ]
        ) {
            scenario(`should detect "addDir" when copying ${name}`, async t => {
                await t.start(root!);
                t.copy("home/e/sub", "home/e/sub_copy");
                await t.settled({ reported: ["home/e/sub_copy"] });
            });
        }

        scenario("should detect \"addDir\" when copying a deep parent directory", async t => {
            await t.start("home");
            t.copy("home/e", "home/e_copy");
            await t.settled({ reported: ["home/e_copy", "home/e_copy/sub"] });
        });

        scenario("should detect \"unlinkDir\" when removing a single directory", async t => {
            await t.start("home/a");
            t.remove("home/a");
            await t.settled({ reported: ["home/a"] });
        });

        scenario(
            "should detect \"unlinkDir\" and \"addDir\" when removing a single directory and much later recreating it",
            async t => {
                await t.start("home/a");
                t.remove("home/a");
                await t.settled({ reported: ["home/a"] });
                t.newDir("home/a");
                await t.settled({ reported: ["home/a"] });
            },
        );

        for (const [name, root] of [["a directory", "home/e"], ["a deep directory", "home"]]) {
            scenario(`should detect "unlinkDir" when removing a directory inside ${name}`, async t => {
                await t.start(root!);
                t.remove("home/e/sub");
                await t.settled({ reported: ["home/e/sub"] });
            });
        }

        scenario("should detect \"unlinkDir\" when removing a parent directory", async t => {
            await t.start("home");
            t.remove("home/e");
            await t.settled({ reported: ["home/e/sub", "home/e"] });
        });

        scenario("should detect \"unlinkDir\" when removing a parent directory of the watcher", async t => {
            await t.start("home/e/sub");
            t.remove("home/e");
            await t.settled({ reported: ["home/e/sub"] });
        });

        scenario("should detect \"unlinkDir\" and \"addDir\" when renaming a directory inside a directory", async t => {
            await t.start("home");
            t.rename("home/a", "home/a_alt");
            await t.settled({ reported: ["home/a", "home/a_alt"] });
        });

        scenario(
            "should detect \"unlinkDir\" and \"addDir\" when renaming a directory inside a deep directory",
            async t => {
                await t.start("home");
                t.rename("home/e/sub", "home/e/sub_alt");
                await t.settled({ reported: ["home/e/sub", "home/e/sub_alt"] });
            },
        );

        scenario("should detect \"unlinkDir\" and \"addDir\" when renaming a parent directory", async t => {
            await t.start("home");
            t.rename("home/e", "home/e_alt");
            await t.settled({ reported: ["home/e", "home/e_alt", "home/e/sub", "home/e_alt/sub"] });
        });

        scenario("should detect nothing when creating a new directory and removing it", async t => {
            await t.start("home/a");
            t.newDir("home/a/dir");
            t.remove("home/a/dir");
            await t.settled({ nothing: true });
        });

        scenario("should detect nothing when renaming a parent directory and rerenaming it", async t => {
            await t.start("home");
            t.rename("home/a", "home/a_alt");
            t.rename("home/a_alt", "home/a");
            await t.settled({
                unreported: ["home/a_alt"],
                sauronOnly: { paths: ["home/a"], reason: CONSERVATIVE },
            });
        });

        scenario("should detect \"addDir\" when removing a file and creating a directory of the same name", async t => {
            await t.start("home/a");
            t.remove("home/a/file1");
            t.newDir("home/a/file1");
            await t.settled({ reported: ["home/a/file1"] });
        });

        scenario(
            "should detect \"unlinkDir\" when removing a directory and creating a file of the same name",
            async t => {
                await t.start("home");
                t.remove("home/a");
                t.newFile("home/a");
                await t.settled({ reported: ["home/a"] });
            },
        );

        scenario(
            "should detect \"unlinkDir\" and \"addDir\" when replacing a parent directory with another one of the same name",
            async t => {
                await t.start("home");
                t.remove("home/a");
                t.copy("home/b", "home/a");
                await t.settled({ reported: ["home/a"] });
            },
        );

        scenario("should be able to handle many \"unlinkDir\" events", async t => {
            const dirs = t.newDirs("home/a", 100);
            await t.start("home/a");
            for (const dir of dirs) {
                t.remove(dir);
            }
            await t.settled({ reported: dirs });
        });
    });

    describe("directory events (with renames)", () => {
        notApplicable(
            "every test",
            "The extension runs `watcher` with `renameDetection: false`, so renames are reported as both paths (see above)",
        );
    });

    describe("watcher events", { concurrency: true }, () => {
        scenario("should emit \"all\" alongside specific target events", async t => {
            // Event types do not apply; the paths reported still do.
            await t.start("home/a");
            t.modify("home/a/file1");
            t.newFile("home/a/newdir/newfile");
            await t.settled({ reported: ["home/a/file1", "home/a/newdir", "home/a/newdir/newfile"] });
            t.remove("home/a/file1");
            t.remove("home/a/newdir");
            await t.settled({ reported: ["home/a/file1", "home/a/newdir", "home/a/newdir/newfile"] });
        });

        scenario("should emit \"change\" only after \"ready\"", async t => {
            await t.start("home/a", { duringCrawl: () => t.modify("home/a/file1") });
            await t.settled({
                reported: ["home/a/file1"],
                skipParity: "Made while sauron crawls, which may be before `watcher` has set up its watch",
            });
        });

        scenario("should emit \"close\" when closing", async t => {
            await t.start("home/a/file1");
            await t.sauron[Symbol.asyncDispose]();
            assert.deepEqual(await t.sauron.closed, { type: "disposed" });
        });

        notApplicable("should emit \"ready\" when watching nothing", "sauron requires at least one root (by type)");

        for (
            const [name, roots] of [
                ["a file", ["home/a/file1"]],
                ["a directory", ["home"]],
                ["a directory recursively", ["home"]],
                ["multiple paths recursively", ["home/b/file1", "home/a", "home/b", "home"]],
            ] as const
        ) {
            scenario(`should emit "ready" when watching ${name}`, async t => {
                await t.start(roots);
                assert.ok(t.events.some(([, event]) => event.type === "crawl" && event.done));
            });
        }

        for (
            const [name, roots] of [
                ["a non-existent file", ["home/missing/file1"]],
                ["a non-existent directory", ["home/missing"]],
                ["at least one non-existent path", ["home/b/file1", "home/missing/file1", "home"]],
            ] as const
        ) {
            scenario(`should not emit "error" when watching ${name}`, async t => {
                await t.start(roots);
                await t.settled({ nothing: true });
                const errors = t.events.filter(([, event]) => event.type === "error" || event.type === "degraded");
                assert.deepEqual(errors, []);
            });
        }
    });

    describe("watcher instance", { concurrency: true }, () => {
        scenario("should close all watchers and stop emissions", async t => {
            await t.start("home/a");
            await t.closeWatchers();
            for (const delay of [0, 50, 100]) {
                t.modify("home/a/file1", delay);
            }
            await t.settled({ nothing: true });
            assert.equal(t.sauron.state, "closed");
        });
    });

    describe("watcher options", { concurrency: true }, () => {
        for (const variant of ["is not used", "is used"]) {
            scenario(`should cause delayed emissions when set to >= 0, when "ignoreInitial" ${variant}`, async t => {
                await t.start("home/a");
                const changedAt = performance.now();
                t.modify("home/a/file1");
                await t.settled({ reported: ["home/a/file1"] });
                const delivered = t.events.find(([, event]) => event.type === "changes")![0];
                assert.ok(delivered - changedAt >= DEBOUNCE_MS - 5, `Delivered after ${delivered - changedAt} ms`);
            });
        }

        notApplicable("should not find any children when set to 0", NO_DEPTH);
        notApplicable("should only find immediate children when set to 1", NO_DEPTH);
        notApplicable("should only find up-to-depth-20 children when not set", NO_DEPTH);

        scenario("watches directories deeper than 20 levels (sauron only)", async t => {
            const file = "home/deep/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/file1";
            await t.start("home");
            t.modify(file);
            await t.settled({
                reported: [file],
                sauronOnly: { paths: [file], reason: "`watcher` does not watch beyond 20 levels by default" },
            });
        });

        scenario("should ignore files", async t => {
            await t.start("home", { ignore: /file1/ });
            t.modify("home/a/file1");
            t.modify("home/a/file2", 50);
            await t.settled({ reported: ["home/a/file2"], unreported: ["home/a/file1"] });
        });

        scenario("should ignore directories", async t => {
            await t.start("home", { ignore: /sub/ });
            t.modify("home/e/file1");
            t.modify("home/e/sub/file1");
            await t.settled({ reported: ["home/e/file1"], unreported: ["home/e/sub/file1"] });
        });

        scenario("should ignore initial events from ignored files", async t => {
            // No initial events to ignore, so check that the ignored directory is not watched instead.
            await t.start("home/shallow", { ignore: /1\/2/ });
            t.modify("home/shallow/1/2/file1");
            t.newFile("home/shallow/1/file3");
            await t.settled({ reported: ["home/shallow/1/file3"], unreported: ["home/shallow/1/2/file1"] });
        });

        scenario("should not emit \"add\" and \"addDir\" events when set to \"true\"", async t => {
            await t.start(["home/a", "home/b/file1"]);
            await t.settled({ nothing: true });
        });
        notApplicable("should emit \"add\" and \"addDir\" events when set to \"false\"", NO_INITIAL);
        notApplicable("should emit \"add\" and \"addDir\" events when not set", NO_INITIAL);

        notApplicable("should only find immediate children with \"depth\" set to 1, when set to \"false\"", NO_DEPTH);
        notApplicable(
            "should only find up-to-depth-20 children with \"depth\" not set, when set to \"false\"",
            NO_DEPTH,
        );

        notApplicable("should not watch recursively when not set", NO_NON_RECURSIVE);
        notApplicable("should not watch recursively when set to \"false\"", NO_NON_RECURSIVE);
        scenario("should watch recursively when set to \"true\"", async t => {
            await t.start("home");
            t.modify("home/a/file1");
            await t.settled({ reported: ["home/a/file1"] });
        });
    });

    describe("watching symlinks", () => {
        notApplicable("every test", "`describe.todo` upstream");
    });
});
