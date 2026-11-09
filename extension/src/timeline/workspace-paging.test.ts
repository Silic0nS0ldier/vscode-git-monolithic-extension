import test from "ava";
import path from "node:path";
import {
    groupWorkspaceHistories,
    parseWorkspaceCursor,
    readWorkspaceTimelinePage,
    usesWorktreeRelativeHistory,
    validateWorkspaceRepositories,
    type WorkspaceHistory,
    workspaceRepository,
} from "./workspace-paging.js";

const primary = "a".repeat(40);
const worktree = "b".repeat(40);
const clone = "c".repeat(40);

function histories(): WorkspaceHistory[] {
    return groupWorkspaceHistories([
        {
            root: "/primary",
            tip: primary,
            instance: "primary",
            commonDir: "/shared/.git",
            objectsDir: "/shared/.git/objects",
        },
        {
            root: "/worktree",
            tip: worktree,
            instance: "worktree",
            commonDir: "/shared/.git",
            objectsDir: "/shared/.git/objects",
        },
        { root: "/clone", tip: clone, instance: "clone", commonDir: "/clone/.git", objectsDir: "/clone/.git/objects" },
    ]);
}

test("Linked worktrees share a traversal, but independent clones remain separate", t => {
    const groups = histories();
    t.deepEqual(groups, [
        {
            commonDir: "/shared/.git",
            objectsDir: "/shared/.git/objects",
            repositories: [
                { root: "/primary", tip: primary, instance: "primary" },
                { root: "/worktree", tip: worktree, instance: "worktree" },
            ],
            skip: 0,
        },
        {
            commonDir: "/clone/.git",
            objectsDir: "/clone/.git/objects",
            repositories: [{ root: "/clone", tip: clone, instance: "clone" }],
            skip: 0,
        },
    ]);
    const shared = groups[0]!;
    t.is(workspaceRepository(shared, { hash: primary, source: worktree }), "/primary");
    t.is(workspaceRepository(shared, { hash: "d".repeat(40), source: worktree }), "/worktree");
    t.throws(() => workspaceRepository(shared, { hash: clone, source: clone }));
});

test("Worktrees with different configured object directories are separate histories", t => {
    const groups = groupWorkspaceHistories([
        { root: "/one", tip: primary, instance: "one", commonDir: "/common", objectsDir: "/one/objects" },
        { root: "/two", tip: worktree, instance: "two", commonDir: "/common", objectsDir: "/two/objects" },
    ]);
    t.is(groups.length, 2);
    t.deepEqual(parseWorkspaceCursor(JSON.stringify({ histories: groups, before: 99 })).histories, groups);
});

test("Relative or ambiguous Git history overrides isolate each worktree", t => {
    const absolute = path.resolve("shared-objects");
    t.false(usesWorktreeRelativeHistory({}));
    t.false(usesWorktreeRelativeHistory({
        GIT_ALTERNATE_OBJECT_DIRECTORIES: [absolute, absolute].join(path.delimiter),
        GIT_SHALLOW_FILE: absolute,
        GIT_GRAFT_FILE: absolute,
    }));
    for (
        const env of [
            { GIT_ALTERNATE_OBJECT_DIRECTORIES: "local-objects" },
            { GIT_ALTERNATE_OBJECT_DIRECTORIES: `"${absolute}"` },
            { GIT_ALTERNATE_OBJECT_DIRECTORIES: [absolute, "local-objects"].join(path.delimiter) },
            { GIT_SHALLOW_FILE: "shallow" },
            { GIT_GRAFT_FILE: "grafts" },
        ]
    ) {
        t.true(usesWorktreeRelativeHistory(env));
    }

    const groups = groupWorkspaceHistories([
        {
            root: "/one",
            tip: primary,
            instance: "one",
            commonDir: "/common",
            objectsDir: "/objects",
            isolationRoot: "/one",
        },
        {
            root: "/two",
            tip: worktree,
            instance: "two",
            commonDir: "/common",
            objectsDir: "/objects",
            isolationRoot: "/two",
        },
    ]);
    t.is(groups.length, 2);
    t.deepEqual(parseWorkspaceCursor(JSON.stringify({ histories: groups, before: 99 })).histories, groups);
    t.throws(() =>
        parseWorkspaceCursor(JSON.stringify({ histories: [{ ...groups[0], isolationRoot: "/two" }], before: 99 }))
    );
});

test("A 5000-commit shared worktree history needs one bounded read per page", async t => {
    const commits = Array.from({ length: 5_000 }, (_, index) => ({
        hash: index.toString(16).padStart(40, "0"),
        date: 5_000 - index,
    }));
    let remaining: WorkspaceHistory[] | undefined = histories().slice(0, 1);
    const actual: string[] = [];
    let reads = 0;
    let pages = 0;
    while (remaining) {
        const before = reads;
        const result: {
            page: { history: WorkspaceHistory; commit: (typeof commits)[number] }[];
            histories: WorkspaceHistory[] | undefined;
        } = await readWorkspaceTimelinePage(
            remaining,
            50,
            async (history, maxEntries) => {
                reads++;
                t.is(maxEntries, 51);
                return commits.slice(history.skip, history.skip + maxEntries);
            },
            commit => commit.date,
        );
        t.is(reads - before, 1);
        t.true(result.page.length <= 50);
        actual.push(...result.page.map(({ commit }) => commit.hash));
        remaining = result.histories;
        if (remaining) remaining = parseWorkspaceCursor(JSON.stringify({ histories: remaining, before: 0 })).histories;
        pages++;
    }
    t.is(pages, 100);
    t.is(reads, 100);
    t.deepEqual(actual, commits.map(commit => commit.hash));
});

test("Merging preserves each store's traversal order and retains shared hashes from independent clones", async t => {
    const groups = histories();
    const shared = [
        { hash: "child", date: 10 },
        { hash: "same", date: 50 },
        { hash: "root", date: 5 },
    ];
    const independent = [
        { hash: "clone", date: 30 },
        { hash: "same", date: 20 },
    ];
    const read = async (history: WorkspaceHistory, maxEntries: number) =>
        (history.commonDir === "/shared/.git" ? shared : independent).slice(history.skip, history.skip + maxEntries);
    const first = await readWorkspaceTimelinePage(groups, 2, read, commit => commit.date);
    t.deepEqual(first.page.map(({ commit }) => commit.hash), ["clone", "same"]);
    t.truthy(first.histories);
    const second = await readWorkspaceTimelinePage(first.histories!, 2, read, commit => commit.date);
    t.deepEqual(second.page.map(({ commit }) => commit.hash), ["child", "same"]);
    t.is(second.page[1]?.history.commonDir, "/shared/.git");
    const third = await readWorkspaceTimelinePage(second.histories!, 2, read, commit => commit.date);
    t.deepEqual(third.page.map(({ commit }) => commit.hash), ["root"]);
    t.is(third.histories, undefined);
});

test("A cursor can be replayed after other requests without an evictable deduplication session", async t => {
    const commits = [{ date: 3 }, { date: 2 }, { date: 1 }];
    const read = async (history: WorkspaceHistory, limit: number) => commits.slice(history.skip, history.skip + limit);
    const first = await readWorkspaceTimelinePage(histories().slice(0, 1), 1, read, commit => commit.date);
    const cursor = JSON.stringify({ histories: first.histories, before: 3 });
    const saved = parseWorkspaceCursor(cursor);
    for (let index = 0; index < 12; index++) {
        await readWorkspaceTimelinePage(histories(), 1, read, commit => commit.date);
    }
    const replay = async () => await readWorkspaceTimelinePage(saved.histories, 1, read, commit => commit.date);
    t.deepEqual(await replay(), await replay());
    t.is((await replay()).page[0]?.commit.date, 2);
});

test("Workspace cursors validate their captured roots, tips, offsets and timestamps", t => {
    const groups = histories();
    const cursor = { histories: groups, before: 99 };
    t.deepEqual(parseWorkspaceCursor(JSON.stringify(cursor)), cursor);
    const active = new Map([["/primary", "primary"], ["/worktree", "worktree"], ["/clone", "clone"]]);
    validateWorkspaceRepositories(groups, active);
    t.throws(() => validateWorkspaceRepositories(groups, new Map([["/primary", "primary"], ["/clone", "clone"]])));
    active.set("/worktree", "reopened");
    t.throws(() => validateWorkspaceRepositories(groups, active));
    t.throws(() => parseWorkspaceCursor(JSON.stringify({ ...cursor, before: 1.5 })));
    t.throws(() => parseWorkspaceCursor(JSON.stringify({ ...cursor, histories: [] })));
    t.throws(() =>
        parseWorkspaceCursor(JSON.stringify({
            ...cursor,
            histories: [{ ...groups[0], skip: -1 }],
        }))
    );
    t.throws(() =>
        parseWorkspaceCursor(JSON.stringify({
            ...cursor,
            histories: [{ ...groups[0], repositories: [{ root: "/primary", tip: "--all", instance: "primary" }] }],
        }))
    );
    t.throws(() => parseWorkspaceCursor(JSON.stringify({ ...cursor, histories: [groups[0], groups[0]] })));
});

test("Workspace reads propagate cancellation and limit concurrent Git queries", async t => {
    const groups = Array.from({ length: 12 }, (_, index) => ({
        commonDir: `/repo${index}/.git`,
        objectsDir: `/repo${index}/.git/objects`,
        repositories: [{ root: `/repo${index}`, tip: primary, instance: `repo${index}` }],
        skip: 0,
    }));
    let active = 0;
    let peak = 0;
    await readWorkspaceTimelinePage(groups, 1, async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return [];
    }, () => 0);
    t.is(peak, 4);
    const cancelled = new Error("cancelled");
    const controller = new AbortController();
    let started = 0;
    await t.throwsAsync(
        readWorkspaceTimelinePage(groups, 1, async () => {
            controller.signal.throwIfAborted();
            started++;
            controller.abort(cancelled);
            throw cancelled;
        }, () => 0),
        { is: cancelled },
    );
    t.is(started, 1);
});
