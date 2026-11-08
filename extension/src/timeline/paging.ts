/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DATE_LIMIT = 8_640_000_000_000_000;

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
    if (hash !== undefined && (typeof hash !== "string" || !HASH.test(hash))) {
        throw new Error("Invalid file Timeline cursor");
    }
    return { hash, path: parsed.path, skip: parsed.skip, before: parsed.before };
}
