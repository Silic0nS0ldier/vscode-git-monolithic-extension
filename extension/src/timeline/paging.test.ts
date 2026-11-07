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
    t.deepEqual(result.next, { skips: { "/a": 3, "/b": 1 }, seen: ["a", "b"] });
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
    t.is(result.next, undefined);
});

test("Rejects malformed cursors rather than silently restarting history", t => {
    const workspace = (skips: unknown, seen: unknown = []): string => JSON.stringify({ skips, seen });
    t.throws(() => parseWorkspaceCursor(workspace({ repo: -1 })));
    t.throws(() => parseWorkspaceCursor(workspace({ repo: 1.5 })));
    t.throws(() => parseWorkspaceCursor(workspace([])));
    t.throws(() => parseWorkspaceCursor(workspace({ repo: 5 }, ["--all"])));
    t.throws(() => parseWorkspaceCursor(workspace({ repo: 5 }, "a".repeat(40))));
    t.throws(() => parseWorkspaceCursor("{\"repo\":5}"));
    t.throws(() => parseWorkspaceCursor("[]"));
    t.deepEqual(parseWorkspaceCursor(workspace({ repo: 5 }, ["a".repeat(40)])), {
        skips: { repo: 5 },
        seen: ["a".repeat(40)],
    });
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
            { root: "/a", skip: 0, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
            { root: "/b", skip: 0, commits: [{ hash: "same", date: 20 }, { hash: "older", date: 10 }] },
        ],
        1,
        c => c.date,
    );
    t.deepEqual(result.page.map(e => e.commit.hash), ["same"]);
    t.deepEqual(result.next, { skips: { "/a": 1, "/b": 1 }, seen: ["same"] });
});

/** Reads workspace history a page at a time, as the provider does, fetching `limit + 1` commits per log. */
function readWorkspaceHistory(logs: Record<string, { hash: string; date: number }[]>, limit: number): string[] {
    const shown: string[] = [];
    let cursor: { skips: Record<string, number>; seen: string[] } | undefined;
    for (let request = 0; request < 20; request++) {
        const roots = Object.keys(logs).filter(root => !cursor || Object.hasOwn(cursor.skips, root));
        const { page, next } = getWorkspaceTimelinePage(
            roots.map(root => {
                const skip = cursor?.skips[root] ?? 0;
                return { root, skip, commits: (logs[root] ?? []).slice(skip, skip + limit + 1) };
            }),
            limit,
            c => c.date,
            cursor?.seen,
        );
        shown.push(...page.map(e => e.commit.hash));
        if (!next) return shown;
        cursor = next;
    }
    throw new Error("Workspace history did not terminate");
}

test("Worktree commits are not repeated on later pages when authored dates reorder their logs", t => {
    const shared = { hash: "shared", date: 30 };
    const root = { hash: "root", date: 10 };
    t.deepEqual(
        readWorkspaceHistory({ "/a": [shared, root], "/b": [{ hash: "child", date: 20 }, shared, root] }, 1),
        ["shared", "child", "root"],
    );
});

test("A log of duplicates fetched in full continues from where it was read", t => {
    const common = Array.from({ length: 4 }, (_, index) => ({ hash: `common${index}`, date: 100 - index }));
    t.deepEqual(
        readWorkspaceHistory({
            "/a": common,
            "/b": [...common, { hash: "only-b", date: 1 }],
        }, 2),
        ["common0", "common1", "common2", "common3", "only-b"],
    );
});

test("A fetched window of only duplicates does not end that repository's history", t => {
    const shared = [{ hash: "s1", date: 50 }, { hash: "s2", date: 49 }, { hash: "s3", date: 48 }];
    t.deepEqual(
        readWorkspaceHistory({ "/a": shared, "/b": [{ hash: "c", date: 10 }, ...shared, { hash: "d", date: 1 }] }, 1),
        ["s1", "s2", "s3", "c", "d"],
    );
});
