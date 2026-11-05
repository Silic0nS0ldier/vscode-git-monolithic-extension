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

export function getWorkspaceTimelinePage<T extends { hash: string }>(
    logs: readonly { root: string; commits: readonly T[]; skip: number }[],
    limit: number,
    getTimestamp: (commit: T, log: number) => number,
): { page: { log: number; commit: T }[]; nextSkip: Record<string, number> | undefined } {
    const page: { log: number; commit: T }[] = [];
    const states = logs.map((source, log) => ({ ...source, log, position: 0 }));
    const hashes = new Set<string>();
    while (page.length < limit) {
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
        if (!hashes.has(commit.hash)) {
            hashes.add(commit.hash);
            page.push({ log: next.state.log, commit });
        }
    }
    const nextSkip: Record<string, number> = {};
    for (const state of states) {
        // Also consume duplicate heads at a page boundary, so worktrees do not repeat that page's last commit.
        while (true) {
            const commit = state.commits[state.position];
            if (!commit || !hashes.has(commit.hash)) break;
            state.position++;
        }
        if (state.commits.length > state.position) nextSkip[state.root] = state.skip + state.position;
    }
    return { page, nextSkip: Object.keys(nextSkip).length ? nextSkip : undefined };
}

export function parseWorkspaceCursor(cursor: string): Record<string, number> {
    const parsed: unknown = JSON.parse(cursor);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid workspace Timeline cursor");
    }
    const entries: [string, unknown][] = Object.entries(parsed);
    const offsets: Record<string, number> = {};
    for (const [root, offset] of entries) {
        if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
            throw new Error("Invalid workspace Timeline cursor");
        }
        offsets[root] = offset;
    }
    return offsets;
}

export function parseFileCursor(cursor: string): { hash: string | undefined; path: string; liveOffset?: number } {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("path" in parsed)
        || typeof parsed.path !== "string" || !parsed.path
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    const hash = "hash" in parsed ? parsed.hash : undefined;
    const liveOffset = "liveOffset" in parsed ? parsed.liveOffset : undefined;
    if (
        (hash !== undefined && (typeof hash !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(hash)))
        || (liveOffset !== undefined && (typeof liveOffset !== "number" || liveOffset !== 1))
        || (hash === undefined && liveOffset === undefined)
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    return { hash, path: parsed.path, ...(liveOffset === undefined ? {} : { liveOffset }) };
}
