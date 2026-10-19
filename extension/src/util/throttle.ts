/**
 * Wraps `fn` so at most `size` invocations run concurrently. Extra calls are queued (FIFO) until an earlier call
 * settles. Use a `size` of `1` for an exclusive lock.
 */
export function throttle<TResult, TArgs extends unknown[]>(
    size: number,
    fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
    if (!Number.isInteger(size) || size < 1) {
        throw new RangeError(`Expected throttle size to be a positive integer but got ${size}`);
    }

    let available = size;
    const waiting: (() => void)[] = [];

    function release(): void {
        const next = waiting.shift();
        if (next) {
            // Slot is handed directly to the next waiter.
            next();
        } else {
            available++;
        }
    }

    return async function(this: unknown, ...args: TArgs): Promise<TResult> {
        if (available > 0) {
            available--;
        } else {
            await new Promise<void>(resolve => waiting.push(resolve));
        }
        try {
            return await fn.apply(this, args);
        } finally {
            release();
        }
    };
}
