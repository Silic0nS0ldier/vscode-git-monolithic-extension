export type Box<T> = {
    get(): T;
    set(value: T): void;
};

/**
 * Boxes a value so that it can be treated more like a pointer.
 * Handy for working towards pure-functional code incrementally.
 */
export function createBox<T>(initValue: T): Box<T> {
    let value = initValue;
    return {
        get(): T {
            return value;
        },
        set(newValue): void {
            value = newValue;
        },
    };
}
