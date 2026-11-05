import test from "ava";
import { getFileTimelinePage, getWorkspaceTimelinePage, parseFileCursor, parseWorkspaceCursor } from "./paging.js";

test("Live entries share the file Timeline page budget with commits", t => {
    const commits = Array.from({ length: 9 }, (_, index) => index);
    for (const liveCount of [0, 1, 2]) {
        const page = getFileTimelinePage(commits, 5, liveCount);
        t.is(page.liveCount, liveCount);
        t.is(page.commitCount, 5 - liveCount);
        t.is(page.nextLiveOffset, undefined);
        t.is(page.liveCount + page.commitCount, 5);
    }
});

test("Repeated file Timeline refreshes do not increase the cached page size", t => {
    const commits = Array.from({ length: 9 }, (_, index) => index);
    let limit = 5;
    for (let refresh = 0; refresh < 5; refresh++) {
        const page = getFileTimelinePage(commits, limit, 1);
        limit = page.liveCount + page.commitCount;
        t.is(limit, 5);
        t.is(page.commitCount, 4);
        t.is(commits[page.commitCount], 4, "the cursor keeps the first undisplayed commit");
    }
});

test("One-item pages retain both live entries before the first commit", t => {
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
    t.deepEqual(getFileTimelinePage(commits, 1, 0), {
        liveCount: 0,
        commitCount: 1,
        nextLiveOffset: undefined,
    });
});

test("Live-only and changing-status pages terminate without losing available history", t => {
    t.deepEqual(getFileTimelinePage([], 1, 2, 1), {
        liveCount: 1,
        commitCount: 0,
        nextLiveOffset: undefined,
    });
    t.deepEqual(getFileTimelinePage([0], 1, 0, 1), {
        liveCount: 0,
        commitCount: 1,
        nextLiveOffset: undefined,
    });
    t.deepEqual(parseFileCursor(JSON.stringify({ path: "unborn.txt", liveOffset: 1 })), {
        hash: undefined,
        path: "unborn.txt",
        liveOffset: 1,
    });
});

test("Merges workspace history while advancing only contiguous repository prefixes", t => {
    const logs = [
        { root: "/a", skip: 2, commits: [{ hash: "a", date: 30 }, { hash: "c", date: 10 }] },
        { root: "/b", skip: 0, commits: [{ hash: "b", date: 20 }, { hash: "d", date: 5 }] },
    ];
    const result = getWorkspaceTimelinePage(logs, 2, c => c.date);
    t.deepEqual(result.page.map(e => e.commit.hash), ["a", "b"]);
    t.deepEqual(result.nextSkip, { "/a": 3, "/b": 1 });
});

test("Duplicate worktree commits do not consume the visible page limit", t => {
    const result = getWorkspaceTimelinePage(
        [
            { root: "/a", skip: 0, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
            { root: "/b", skip: 0, commits: [{ hash: "same", date: 20 }] },
        ],
        2,
        c => c.date,
    );
    t.deepEqual(result.page.map(e => e.commit.hash), ["same", "older"]);
    t.is(result.nextSkip, undefined);
});

test("Rejects malformed cursors rather than silently restarting history", t => {
    t.throws(() => parseWorkspaceCursor("{\"repo\":-1}"));
    t.throws(() => parseWorkspaceCursor("{\"repo\":1.5}"));
    t.throws(() => parseWorkspaceCursor("[]"));
    t.deepEqual(parseWorkspaceCursor("{\"repo\":5}"), { repo: 5 });
    t.throws(() => parseFileCursor("{\"hash\":\"--all\",\"path\":\"file\"}"));
    t.throws(() => parseFileCursor("{\"path\":\"file\"}"));
    for (const liveOffset of [0, 2, -1, 1.5, "1", null]) {
        t.throws(() => parseFileCursor(JSON.stringify({ hash: "a".repeat(40), path: "file", liveOffset })));
    }
    t.deepEqual(parseFileCursor(JSON.stringify({ hash: "a".repeat(64), path: "file", liveOffset: 1 })), {
        hash: "a".repeat(64),
        path: "file",
        liveOffset: 1,
    });
    t.deepEqual(parseFileCursor(JSON.stringify({ hash: "a".repeat(40), path: "old\nfile" })), {
        hash: "a".repeat(40),
        path: "old\nfile",
    });
});

test("Duplicate worktree heads are consumed at page boundaries", t => {
    const result = getWorkspaceTimelinePage(
        [
            { root: "/a", skip: 0, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
            { root: "/b", skip: 0, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
        ],
        1,
        c => c.date,
    );
    t.deepEqual(result.page.map(e => e.commit.hash), ["same"]);
    t.deepEqual(result.nextSkip, { "/a": 1, "/b": 1 });
});
