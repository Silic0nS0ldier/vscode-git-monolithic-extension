import { createScheduler } from "./scheduler.js";

/**
 * Wraps `fn` so at most one invocation runs at a time and at most one more is pending; calls made while one is
 * already pending join it (their arguments are discarded).
 *
 * Suits idempotent work (refresh, fetch, sync) where repeat requests made while busy only need to be honoured once.
 * Read mutable state inside `fn` rather than passing it as an argument, as the follow-up runs later.
 *
 * See {@link createScheduler} to share one queue across several functions.
 */
export function coalesce<TResult, TArgs extends unknown[]>(
    fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
    return createScheduler().coalesced(fn);
}
