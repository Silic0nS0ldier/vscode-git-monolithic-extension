/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DATE_LIMIT = 8_640_000_000_000_000;

export async function readStableHistory<T>(
    tip: string | undefined,
    read: (tip: string | undefined) => Promise<T[]>,
    resolveHead: () => Promise<string | undefined>,
): Promise<{ tip: string | undefined; commits: T[] }> {
    const commits = await read(tip);
    if (tip !== undefined || commits.length === 0) return { tip, commits };
    const resolved = await resolveHead();
    if (!resolved || !HASH.test(resolved)) throw new Error("Cannot resolve a stable Timeline traversal tip");
    return { tip: resolved, commits: await read(resolved) };
}

export function remainingLiveOffset(live: readonly { ref: string }[], shown?: number): number {
    // The only resumable live entry is the working version; status may have removed it since the last page.
    return shown === 1 && live[0]?.ref === "" ? 1 : 0;
}

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

function isTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= DATE_LIMIT;
}

export function orderedTimestamp(timestamp: number, before?: number): number {
    if (!isTimestamp(timestamp) || (before !== undefined && !isTimestamp(before))) {
        throw new Error("Invalid Timeline timestamp");
    }
    // VS Code sorts Timeline items by timestamp, including when a later Git ancestor has a newer date.
    const ordered = before === undefined ? timestamp : Math.min(timestamp, before - 1);
    if (!isTimestamp(ordered)) throw new Error("Timeline timestamp cannot preserve history order");
    return ordered;
}

export type FileCursor = {
    hash: string | undefined;
    path: string;
    skip: number;
    before: number;
    liveOffset?: number;
};

export function parseFileCursor(cursor: string): FileCursor {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("path" in parsed) || !("skip" in parsed) || !("before" in parsed)
        || typeof parsed.path !== "string" || !parsed.path
        || typeof parsed.skip !== "number" || !Number.isSafeInteger(parsed.skip) || parsed.skip < 0
        || !isTimestamp(parsed.before)
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    const hash = "hash" in parsed ? parsed.hash : undefined;
    const liveOffset = "liveOffset" in parsed ? parsed.liveOffset : undefined;
    if (
        (hash !== undefined && (typeof hash !== "string" || !HASH.test(hash)))
        || (liveOffset !== undefined && liveOffset !== 1)
    ) {
        throw new Error("Invalid file Timeline cursor");
    }
    return {
        hash,
        path: parsed.path,
        skip: parsed.skip,
        before: parsed.before,
        ...(liveOffset === undefined ? {} : { liveOffset }),
    };
}
