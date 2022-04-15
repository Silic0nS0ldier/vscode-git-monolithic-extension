type Constructor<T> = new(...args: any[]) => T;

export function isExpectedError<TErr extends Error>(err: unknown, type: Constructor<TErr>, condition: (err: TErr) => boolean) {
    if (err instanceof type) {
        return condition(err as unknown as TErr);
    }
    return false;
}