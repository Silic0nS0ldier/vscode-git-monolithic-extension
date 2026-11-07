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
    /** Commits already read from each repository's log, keyed by repository root. */
    skips: Record<string, number>;
    /** Commits already shown, so a worktree sharing them does not show them again on a later page. */
    seen: string[];
};

/**
 * Merges the next page of workspace history from each repository's log. Each log holds up to `limit + 1`
 * commits from its cursor position, so one holding more than `limit` may continue past those given.
 */
export function getWorkspaceTimelinePage<T extends { hash: string }>(
    logs: readonly { root: string; commits: readonly T[]; skip: number }[],
    limit: number,
    getTimestamp: (commit: T, log: number) => number,
    seen: readonly string[] = [],
): { page: { log: number; commit: T }[]; next: WorkspaceCursor | undefined } {
    const page: { log: number; commit: T }[] = [];
    const states = logs.map((source, log) => ({ ...source, log, position: 0 }));
    const hashes = new Set(seen);
    const partial = (state: typeof states[number]): boolean => state.commits.length > limit;
    // Duplicates do not fill the page, so a partial log can run out; its next commit may be newer than the others'.
    while (page.length < limit && !states.some(state => partial(state) && !state.commits[state.position])) {
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
    const skips: Record<string, number> = {};
    for (const state of states) {
        // Also consume duplicate heads at a page boundary, so worktrees do not repeat that page's last commit.
        while (true) {
            const commit = state.commits[state.position];
            if (!commit || !hashes.has(commit.hash)) break;
            state.position++;
        }
        if (state.commits.length > state.position || partial(state)) skips[state.root] = state.skip + state.position;
    }
    return { page, next: Object.keys(skips).length ? { skips, seen: [...hashes] } : undefined };
}

export function parseWorkspaceCursor(cursor: string): WorkspaceCursor {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("skips" in parsed) || !("seen" in parsed)
        || !parsed.skips || typeof parsed.skips !== "object" || Array.isArray(parsed.skips)
        || !Array.isArray(parsed.seen)
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
    const hashes: unknown[] = parsed.seen;
    const seen: string[] = [];
    for (const hash of hashes) {
        if (typeof hash !== "string" || !HASH.test(hash)) throw new Error("Invalid workspace Timeline cursor");
        seen.push(hash);
    }
    return { skips, seen };
}

export type FileCursor = {
    /** The revision to read history from. */
    hash: string | undefined;
    path: string;
    /** Live entries already shown. */
    liveOffset?: number;
    /** Commits already shown from `hash`, for history that is not linear, such as a folder's. */
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
