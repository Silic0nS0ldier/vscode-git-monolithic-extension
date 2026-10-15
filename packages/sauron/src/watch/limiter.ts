export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `concurrency` tasks at once, in submission order. */
export function createLimiter(concurrency: number): Limiter {
    let active = 0;
    const queue: (() => void)[] = [];
    return async task => {
        if (active < concurrency) {
            active++;
        } else {
            // The finishing task hands its slot over directly, so `active` is not decremented in between.
            await new Promise<void>(resolve => queue.push(resolve));
        }
        try {
            return await task();
        } finally {
            const next = queue.shift();
            if (next === undefined) {
                active--;
            } else {
                next();
            }
        }
    };
}
