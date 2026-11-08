import test from "ava";
import {
    getFileTimelinePage,
    orderedTimestamp,
    parseFileCursor,
    readStableHistory,
    remainingLiveOffset,
} from "./paging.js";

test("History resolves and rereads a stable tip when repository status has not supplied one", async t => {
    const head = "a".repeat(40);
    const reads: (string | undefined)[] = [];
    const result = await readStableHistory(
        undefined,
        async tip => {
            reads.push(tip);
            return tip ? ["stable"] : ["possibly stale"];
        },
        async () => head,
    );
    t.deepEqual(result, { tip: head, commits: ["stable"] });
    t.deepEqual(reads, [undefined, head]);

    const empty = await readStableHistory(undefined, async () => [], async () => {
        t.fail("An empty history does not need its unborn HEAD resolved");
        return undefined;
    });
    t.deepEqual(empty, { tip: undefined, commits: [] });
    await t.throwsAsync(readStableHistory(undefined, async () => ["commit"], async () => "--all"));
});

test("Live entries and commits share the file Timeline page budget", t => {
    const commits = Array.from({ length: 9 }, (_, index) => index);
    for (const liveCount of [0, 1, 2]) {
        const page = getFileTimelinePage(commits, 5, liveCount);
        t.is(page.liveCount, liveCount);
        t.is(page.commitCount, 5 - liveCount);
        t.is(page.nextLiveOffset, undefined);
    }
});

test("One-item pages retain live entries before committed history", t => {
    const commits = [0, 1];
    t.deepEqual(getFileTimelinePage(commits, 1, 2), {
        liveCount: 1,
        commitCount: 0,
        nextLiveOffset: 1,
    });
    t.deepEqual(getFileTimelinePage(commits, 1, 2, 1), {
        liveCount: 1,
        commitCount: 0,
        nextLiveOffset: undefined,
    });
    t.deepEqual(getFileTimelinePage([0], 1, 0, 1), {
        liveCount: 0,
        commitCount: 1,
        nextLiveOffset: undefined,
    });
});

test("A status change between pages does not skip the remaining staged entry", t => {
    const working = { ref: "" };
    const staged = { ref: "~" };
    t.is(remainingLiveOffset([working, staged], 1), 1);
    t.is(remainingLiveOffset([staged], 1), 0);
    t.is(remainingLiveOffset([working], 1), 1);
    t.is(remainingLiveOffset([], 1), 0);
    const offset = remainingLiveOffset([staged], 1);
    t.deepEqual(getFileTimelinePage([0], 1, 1, offset), {
        liveCount: 1,
        commitCount: 0,
        nextLiveOffset: undefined,
    });
});

test("Timeline timestamps preserve Git traversal order across page boundaries", t => {
    t.is(orderedTimestamp(100), 100);
    t.is(orderedTimestamp(90, 100), 90);
    t.is(orderedTimestamp(100, 100), 99);
    t.is(orderedTimestamp(120, 99), 98);
    t.is(orderedTimestamp(50, 98), 50);
    t.throws(() => orderedTimestamp(Number.NaN));
    t.throws(() => orderedTimestamp(0, Number.POSITIVE_INFINITY));
    t.throws(() => orderedTimestamp(-8_640_000_000_000_000, -8_640_000_000_000_000));
});

test("File Timeline cursors retain their tip, path, offset and ordering timestamp", t => {
    const cursor = { hash: "a".repeat(40), path: "old\nfile", skip: 50, before: 99 };
    t.deepEqual(parseFileCursor(JSON.stringify(cursor)), cursor);
    t.deepEqual(parseFileCursor(JSON.stringify({ path: "file", skip: 1, before: 0 })), {
        hash: undefined,
        path: "file",
        skip: 1,
        before: 0,
    });
    t.throws(() => parseFileCursor("{\"hash\":\"--all\",\"path\":\"file\",\"skip\":1,\"before\":0}"));
    for (const skip of [-1, 1.5, "1", null]) {
        t.throws(() => parseFileCursor(JSON.stringify({ path: "file", skip, before: 0 })));
    }
    for (const before of [null, 1.5, "1", 8_640_000_000_000_001]) {
        t.throws(() => parseFileCursor(JSON.stringify({ path: "file", skip: 1, before })));
    }
    for (const liveOffset of [0, 2, -1, 1.5, "1", null]) {
        t.throws(() => parseFileCursor(JSON.stringify({ path: "file", skip: 0, before: 99, liveOffset })));
    }
    t.deepEqual(parseFileCursor(JSON.stringify({ path: "file", skip: 0, before: 99, liveOffset: 1 })), {
        hash: undefined,
        path: "file",
        skip: 0,
        before: 99,
        liveOffset: 1,
    });
    t.throws(() => parseFileCursor("{\"path\":\"file\"}"));
});
