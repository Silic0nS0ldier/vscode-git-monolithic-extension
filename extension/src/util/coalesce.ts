/**
 * Wraps `fn` so at most one invocation runs at a time and at most one more is pending.
 *
 * - Idle: `fn` runs immediately.
 * - Running: a single follow-up run is scheduled for when the current one settles.
 * - Running with a follow-up already scheduled: the caller joins that follow-up and its arguments are discarded.
 *
 * Suits idempotent work (refresh, fetch, sync) where repeat requests made while busy only need to be honoured once.
 * Read mutable state inside `fn` rather than passing it as an argument, as the follow-up runs later.
 */
export function coalesce<TResult, TArgs extends unknown[]>(
    fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
    let current: Promise<TResult> | undefined;
    let next: Promise<TResult> | undefined;

    function start(self: unknown, args: TArgs): Promise<TResult> {
        const run = (async () => fn.apply(self, args))();
        current = run;
        const clear = (): void => {
            if (current === run) {
                current = undefined;
            }
        };
        run.then(clear, clear);
        return run;
    }

    return function(this: unknown, ...args: TArgs): Promise<TResult> {
        if (next) {
            return next;
        }
        if (current) {
            const settled = current.then(() => {}, () => {});
            next = settled.then(() => {
                next = undefined;
                return start(this, args);
            });
            return next;
        }
        return start(this, args);
    };
}
