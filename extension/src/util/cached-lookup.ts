/** A lookup kept until invalidated. A failed lookup is not kept, so the next `get()` retries it. */
export type CachedLookup<T> = {
    get(): Promise<T>;
    invalidate(): void;
};

export function createCachedLookup<T>(load: () => Promise<T>): CachedLookup<T> {
    let value: Promise<T> | undefined;

    return {
        get() {
            if (value === undefined) {
                const pending = load();
                value = pending;
                pending.catch(() => {
                    if (value === pending) {
                        value = undefined;
                    }
                });
            }
            return value;
        },
        invalidate() {
            value = undefined;
        },
    };
}
