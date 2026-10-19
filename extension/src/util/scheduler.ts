export interface Scheduler {
    /** Every call is queued and runs in turn. */
    readonly exclusive: <TResult, TArgs extends unknown[]>(
        fn: (...args: TArgs) => Promise<TResult>,
    ) => (...args: TArgs) => Promise<TResult>;
    /**
     * Calls are queued and run in turn, but while a call to this wrapper is waiting in the queue, further calls join
     * it (their arguments are discarded) instead of queuing again.
     *
     * Suits idempotent work (refresh, fetch, sync). Read mutable state inside `fn` rather than passing it as an
     * argument, as the queued call runs later.
     */
    readonly coalesced: <TResult, TArgs extends unknown[]>(
        fn: (...args: TArgs) => Promise<TResult>,
    ) => (...args: TArgs) => Promise<TResult>;
}

/**
 * Creates a FIFO queue that runs one task at a time. Functions wrapped by the same scheduler never overlap.
 * A task starts synchronously when the queue is idle.
 */
export function createScheduler(): Scheduler {
    let active = false;
    const waiting: (() => void)[] = [];

    function release(): void {
        const next = waiting.shift();
        if (next) {
            next();
        } else {
            active = false;
        }
    }

    function schedule<T>(task: () => Promise<T>): Promise<T> {
        const run = async (): Promise<T> => {
            try {
                return await task();
            } finally {
                release();
            }
        };

        if (!active) {
            active = true;
            return run();
        }

        const { promise, resolve } = Promise.withResolvers<T>();
        waiting.push(() => resolve(run()));
        return promise;
    }

    return {
        exclusive(fn) {
            return function(this: unknown, ...args) {
                return schedule(() => fn.apply(this, args));
            };
        },
        coalesced<TResult, TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<TResult>) {
            let pending: Promise<TResult> | undefined;
            return function(this: unknown, ...args: TArgs): Promise<TResult> {
                if (pending) {
                    return pending;
                }
                let started = false;
                const result = schedule(() => {
                    started = true;
                    pending = undefined;
                    return fn.apply(this, args);
                });
                // When the queue is idle the task starts synchronously, so there is nothing left pending.
                if (!started) {
                    pending = result;
                }
                return result;
            };
        },
    };
}
