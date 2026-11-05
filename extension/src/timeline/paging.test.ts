import test from "ava";
import {
    createWorkspaceSessions,
    getFileTimelinePage,
    getWorkspaceTimelinePage,
    parseFileCursor,
    parseWorkspaceCursor,
    readWorkspaceTimelinePage,
} from "./paging.js";

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
        { root: "/a", skip: 2, complete: true, commits: [{ hash: "a", date: 30 }, { hash: "c", date: 10 }] },
        { root: "/b", skip: 0, complete: true, commits: [{ hash: "b", date: 20 }, { hash: "d", date: 5 }] },
    ];
    const result = getWorkspaceTimelinePage(logs, 2, c => c.date);
    t.deepEqual(result.page.map(e => e.commit.hash), ["a", "b"]);
    t.deepEqual(result.skips, { "/a": 3, "/b": 1 });
    t.true(result.lookahead);
});

test("Duplicate worktree commits do not consume the visible page limit", t => {
    const result = getWorkspaceTimelinePage(
        [
            { root: "/a", skip: 0, complete: true, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
            { root: "/b", skip: 0, complete: true, commits: [{ hash: "same", date: 20 }] },
        ],
        2,
        c => c.date,
    );
    t.deepEqual(result.page.map(e => e.commit.hash), ["same", "older"]);
    t.is(result.skips, undefined);
});

test("Rejects malformed cursors rather than silently restarting history", t => {
    const workspace = (skips: unknown, session: unknown = "s", page: unknown = 1): string =>
        JSON.stringify({ session, page, skips });
    t.throws(() => parseWorkspaceCursor(workspace({ repo: -1 })));
    t.throws(() => parseWorkspaceCursor(workspace({ repo: 1.5 })));
    t.throws(() => parseWorkspaceCursor(workspace([])));
    for (const session of ["", 1, null]) t.throws(() => parseWorkspaceCursor(workspace({ repo: 5 }, session)));
    for (const page of [0, -1, 1.5, "1"]) t.throws(() => parseWorkspaceCursor(workspace({ repo: 5 }, "s", page)));
    t.throws(() => parseWorkspaceCursor("{\"repo\":5}"));
    t.throws(() => parseWorkspaceCursor("[]"));
    t.deepEqual(parseWorkspaceCursor(workspace({ repo: 5 }, "s", 3)), { session: "s", page: 3, skips: { repo: 5 } });
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
    for (const skip of [-1, 1.5, "1", null]) {
        t.throws(() => parseFileCursor(JSON.stringify({ hash: "a".repeat(40), path: "folder", skip })));
    }
    t.deepEqual(parseFileCursor(JSON.stringify({ hash: "a".repeat(40), path: "folder", skip: 50 })), {
        hash: "a".repeat(40),
        path: "folder",
        skip: 50,
    });
    t.deepEqual(parseFileCursor(JSON.stringify({ path: "folder", skip: 50 })), {
        hash: undefined,
        path: "folder",
        skip: 50,
    });
});

test("Duplicate worktree heads are consumed at page boundaries", t => {
    const result = getWorkspaceTimelinePage(
        [
            {
                root: "/a",
                skip: 0,
                complete: false,
                commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }],
            },
            {
                root: "/b",
                skip: 0,
                complete: false,
                commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }],
            },
        ],
        1,
        c => c.date,
    );
    t.deepEqual(result.page.map(e => e.commit.hash), ["same"]);
    t.deepEqual(result.skips, { "/a": 1, "/b": 1 });
});

type Logs = Record<string, { hash: string; date: number }[]>;

/** Reads workspace history a page at a time, as the provider does, returning each page's commits. */
async function readWorkspacePages(
    logs: Logs,
    limit: number,
): Promise<{ pages: string[][]; cursors: string[]; reads: number }> {
    const sessions = createWorkspaceSessions(8);
    const pages: string[][] = [];
    const cursors: string[] = [];
    let reads = 0;
    let cursor: { session: string; page: number; skips: Record<string, number> } | undefined;
    for (let request = 0; request < 20; request++) {
        const session = cursor?.session ?? "session";
        const shown = sessions.open(session, cursor?.page ?? 0);
        const { page, skips } = await readWorkspaceTimelinePage(
            cursor?.skips ?? Object.fromEntries(Object.keys(logs).map(root => [root, 0])),
            limit,
            async (root, skip, maxEntries) => {
                reads++;
                return (logs[root] ?? []).slice(skip, skip + maxEntries);
            },
            c => c.date,
            shown.seen,
        );
        shown.record(page.map(e => e.commit.hash));
        pages.push(page.map(e => e.commit.hash));
        if (!skips) return { pages, cursors, reads };
        const next = { session, page: (cursor?.page ?? 0) + 1, skips };
        cursors.push(JSON.stringify(next));
        cursor = parseWorkspaceCursor(JSON.stringify(next));
    }
    throw new Error("Workspace history did not terminate");
}

async function readWorkspaceHistory(logs: Logs, limit: number): Promise<string[]> {
    return (await readWorkspacePages(logs, limit)).pages.flat();
}

test("Worktree commits are not repeated on later pages when authored dates reorder their logs", async t => {
    const shared = { hash: "shared", date: 30 };
    const root = { hash: "root", date: 10 };
    t.deepEqual(
        await readWorkspaceHistory({ "/a": [shared, root], "/b": [{ hash: "child", date: 20 }, shared, root] }, 1),
        ["shared", "child", "root"],
    );
});

test("A log of duplicates fetched in full continues from where it was read", async t => {
    const common = Array.from({ length: 4 }, (_, index) => ({ hash: `common${index}`, date: 100 - index }));
    t.deepEqual(
        await readWorkspaceHistory({
            "/a": common,
            "/b": [...common, { hash: "only-b", date: 1 }],
        }, 2),
        ["common0", "common1", "common2", "common3", "only-b"],
    );
});

test("A fetched window of only duplicates does not end that repository's history", async t => {
    const shared = [{ hash: "s1", date: 50 }, { hash: "s2", date: 49 }, { hash: "s3", date: 48 }];
    t.deepEqual(
        await readWorkspaceHistory({
            "/a": shared,
            "/b": [{ hash: "c", date: 10 }, ...shared, { hash: "d", date: 1 }],
        }, 1),
        ["s1", "s2", "s3", "c", "d"],
    );
});

const primary = Array.from({ length: 5 }, (_, index) => ({ hash: `p${5 - index}`, date: 5 - index }));

test("Windows of only duplicates are read within one request rather than returned as an empty page", async t => {
    // A worktree whose tip predates the history it shares with the primary repository.
    const { pages } = await readWorkspacePages({
        "/primary": primary,
        "/worktree": [{ hash: "w", date: 0 }, ...primary],
    }, 2);
    t.deepEqual(pages, [["p5", "p4"], ["p3", "p2"], ["p1", "w"]]);
});

test("A full page only continues when unshown history remains", async t => {
    const { pages } = await readWorkspacePages({ "/a": primary, "/b": primary }, 1);
    t.deepEqual(pages, [["p5"], ["p4"], ["p3"], ["p2"], ["p1"]]);
    const shared = await readWorkspacePages({ "/a": primary.slice(0, 2), "/b": primary }, 2);
    t.deepEqual(shared.pages.flat(), primary.map(c => c.hash));
    t.true(shared.pages.every(page => page.length > 0));
});

test("Workspace cursors stay small however much history has been shown", async t => {
    const long = Array.from({ length: 200 }, (_, index) => ({ hash: `c${index}`, date: 1000 - index }));
    const { cursors } = await readWorkspacePages({ "/a": long, "/b": long }, 10);
    t.true(cursors.length >= 19);
    t.true(cursors.every(cursor => cursor.length < 100), cursors.at(-1));
});

test("A repeated page request shows the same commits, while later pages omit them", t => {
    const sessions = createWorkspaceSessions(2);
    sessions.open("s", 0).record(["a", "b"]);
    const retry = sessions.open("s", 0);
    t.false(retry.seen("a"));
    retry.record(["a"]);
    t.true(sessions.open("s", 1).seen("a"));
    t.true(sessions.open("s", 1).seen("b"));
    t.false(sessions.open("s", 1).seen("c"));
});

test("Only the most recently used workspace sessions are remembered", t => {
    const sessions = createWorkspaceSessions(2);
    sessions.open("old", 0).record(["a"]);
    sessions.open("recent", 0).record(["a"]);
    sessions.open("old", 1);
    sessions.open("newest", 0);
    t.true(sessions.open("old", 1).seen("a"));
    t.false(sessions.open("recent", 1).seen("a"), "the least recently used session is forgotten");
    sessions.clear();
    t.false(sessions.open("old", 1).seen("a"));
});
