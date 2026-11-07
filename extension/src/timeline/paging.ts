/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

export function getFileTimelinePage(
    commits: readonly unknown[],
    limit: number,
    liveCount: number,
    liveOffset = 0,
): { liveCount: number; commitCount: number; nextLiveOffset: number | undefined } {
    const remainingLive = Math.max(0, liveCount - liveOffset);
    const pageLive = Math.min(limit, remainingLive);
    return {
        liveCount: pageLive,
        commitCount: Math.min(commits.length, limit - pageLive),
        nextLiveOffset: remainingLive > pageLive ? liveOffset + pageLive : undefined,
    };
}

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export type WorkspaceCursor = {
    /** The pagination session that remembers which commits were shown; see `createWorkspaceSessions`. */
    session: string;
    /** Pages already shown in the session. */
    page: number;
    /** Commits already read from each repository's log, keyed by repository root. */
    skips: Record<string, number>;
};

/**
 * Remembers the commits each workspace Timeline pagination session has shown, so that worktrees sharing history do not
 * show it twice, without the cursor growing with every page. Only the most recently used sessions are kept; a forgotten
 * session continues as though nothing had been shown.
 */
export function createWorkspaceSessions(capacity: number): {
    /** Opens the commits `session` showed before `page`. */
    open(session: string, page: number): { seen(hash: string): boolean; record(hashes: Iterable<string>): void };
    clear(): void;
} {
    const sessions = new Map<string, Map<string, number>>();
    return {
        open(session, page) {
            // Each commit maps to the page that first showed it, so a repeated request for a page shows it again.
            const shown = sessions.get(session) ?? new Map<string, number>();
            sessions.delete(session);
            sessions.set(session, shown);
            for (const evicted of sessions.keys()) {
                if (sessions.size <= capacity) break;
                sessions.delete(evicted);
            }
            return {
                seen: hash => (shown.get(hash) ?? page) < page,
                record(hashes) {
                    for (const hash of hashes) {
                        if ((shown.get(hash) ?? page) >= page) shown.set(hash, page);
                    }
                },
            };
        },
        clear: () => sessions.clear(),
    };
}

type WorkspaceLog<T> = {
    root: string;
    commits: readonly T[];
    skip: number;
    /** Whether `commits` reaches the end of the log, rather than being a window of it. */
    complete: boolean;
};

/**
 * Merges a page of workspace history from a window of each repository's log, omitting commits already shown, such as
 * those a worktree shares.
 */
export function getWorkspaceTimelinePage<T extends { hash: string }>(
    logs: readonly WorkspaceLog<T>[],
    limit: number,
    getTimestamp: (commit: T, log: number) => number,
    seen: (hash: string) => boolean = () => false,
): {
    page: { log: number; commit: T }[];
    /** Where each unfinished log continues, if any does. */
    skips: Record<string, number> | undefined;
    /** Whether the windows already hold an unshown commit, so a later page is known not to be empty. */
    lookahead: boolean;
} {
    const page: { log: number; commit: T }[] = [];
    const states = logs.map((source, log) => ({ ...source, log, position: 0 }));
    const shown = new Set<string>();
    const isShown = (hash: string): boolean => shown.has(hash) || seen(hash);
    // Duplicates do not fill the page, so a window can run out; its log's next commit may be newer than the others'.
    while (page.length < limit && !states.some(state => !state.complete && !state.commits[state.position])) {
        let next: { state: typeof states[number]; commit: T; timestamp: number } | undefined;
        for (const state of states) {
            const commit = state.commits[state.position];
            if (!commit) continue;
            const timestamp = getTimestamp(commit, state.log);
            if (!next || timestamp > next.timestamp) next = { state, commit, timestamp };
        }
        if (next === undefined) break;
        next.state.position++;
        const { commit } = next;
        if (!isShown(commit.hash)) {
            shown.add(commit.hash);
            page.push({ log: next.state.log, commit });
        }
    }
    const skips: Record<string, number> = {};
    let lookahead = false;
    for (const state of states) {
        // Also consume duplicate heads at a page boundary, so worktrees do not repeat that page's last commit.
        while (true) {
            const commit = state.commits[state.position];
            if (!commit || !isShown(commit.hash)) break;
            state.position++;
        }
        const pending = state.commits.length > state.position;
        if (pending) lookahead = true;
        if (pending || !state.complete) skips[state.root] = state.skip + state.position;
    }
    return { page, skips: Object.keys(skips).length ? skips : undefined, lookahead };
}

/**
 * Reads a page of workspace history, reading further windows of each log while they hold only commits already shown.
 * A cursor is only returned once a later page is known to hold a commit, as VS Code cannot display an empty page that
 * continues.
 */
export async function readWorkspaceTimelinePage<T extends { hash: string }>(
    skips: Readonly<Record<string, number>>,
    limit: number,
    read: (root: string, skip: number, maxEntries: number) => Promise<readonly T[]>,
    getTimestamp: (commit: T, root: string) => number,
    seen: (hash: string) => boolean,
): Promise<{ page: { root: string; commit: T }[]; skips: Record<string, number> | undefined }> {
    const page: { root: string; commit: T }[] = [];
    const shown = new Set<string>();
    const isShown = (hash: string): boolean => shown.has(hash) || seen(hash);
    let current: Readonly<Record<string, number>> = skips;
    // Set once the page is full but its windows hold only commits already shown, while checking the next page's.
    let full: Record<string, number> | undefined;
    while (true) {
        const logs = await Promise.all(
            Object.entries(current).map(async ([root, skip]) => {
                const commits = await read(root, skip, limit + 1);
                return { root, skip, commits, complete: commits.length <= limit };
            }),
        );
        const rootOf = (log: number): string => {
            const source = logs[log];
            if (!source) throw new Error("Unknown workspace Timeline repository");
            return source.root;
        };
        const result = getWorkspaceTimelinePage(
            logs,
            full ? 1 : limit - page.length,
            (commit, log) => getTimestamp(commit, rootOf(log)),
            isShown,
        );
        if (full) {
            if (result.page.length) return { page, skips: full };
        } else {
            for (const { log, commit } of result.page) {
                shown.add(commit.hash);
                page.push({ root: rootOf(log), commit });
            }
        }
        if (!result.skips) return { page, skips: undefined };
        if (!full && page.length === limit) {
            if (result.lookahead) return { page, skips: result.skips };
            full = result.skips;
        }
        current = result.skips;
    }
}

export function parseWorkspaceCursor(cursor: string): WorkspaceCursor {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("skips" in parsed) || !("session" in parsed) || !("page" in parsed)
        || !parsed.skips || typeof parsed.skips !== "object" || Array.isArray(parsed.skips)
        || typeof parsed.session !== "string" || !parsed.session
        || typeof parsed.page !== "number" || !Number.isSafeInteger(parsed.page) || parsed.page < 1
    ) {
        throw new Error("Invalid workspace Timeline cursor");
    }
    const entries: [string, unknown][] = Object.entries(parsed.skips);
    const skips: Record<string, number> = {};
    for (const [root, offset] of entries) {
        if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
            throw new Error("Invalid workspace Timeline cursor");
        }
        skips[root] = offset;
    }
    return { session: parsed.session, page: parsed.page, skips };
}

export type FileCursor = {
    /** The revision to read history from. */
    hash: string | undefined;
    path: string;
    /** Live entries already shown. */
    liveOffset?: number;
    /** Commits already shown from `hash`; history is not linear, so later pages count from the same tip. */
    skip?: number;
};

export function parseFileCursor(cursor: string): FileCursor {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("path" in parsed)
        || typeof parsed.path !== "string" || !parsed.path
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    const hash = "hash" in parsed ? parsed.hash : undefined;
    const liveOffset = "liveOffset" in parsed ? parsed.liveOffset : undefined;
    const skip = "skip" in parsed ? parsed.skip : undefined;
    if (
        (hash !== undefined && (typeof hash !== "string" || !HASH.test(hash)))
        || (liveOffset !== undefined && (typeof liveOffset !== "number" || liveOffset !== 1))
        || (skip !== undefined && (typeof skip !== "number" || !Number.isSafeInteger(skip) || skip < 0))
        || (hash === undefined && liveOffset === undefined && skip === undefined)
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    return {
        hash,
        path: parsed.path,
        ...(liveOffset === undefined ? {} : { liveOffset }),
        ...(skip === undefined ? {} : { skip }),
    };
}
