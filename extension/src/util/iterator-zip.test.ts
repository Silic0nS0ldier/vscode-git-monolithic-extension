import test from "ava";
import { zip } from "./iterator-zip.js";

function tracked<T>(values: T[]): { iterable: Iterable<T>; closed: () => boolean } {
    let closed = false;
    const iterator = values[Symbol.iterator]();
    return {
        iterable: {
            [Symbol.iterator]: () => ({
                next: () => iterator.next(),
                return: () => {
                    closed = true;
                    return { done: true, value: undefined };
                },
            }),
        },
        closed: () => closed,
    };
}

test("zips to the shortest iterable by default", t => {
    t.deepEqual([...zip([[1, 2, 3], ["a", "b"]])], [[1, "a"], [2, "b"]]);
});

test("zips nothing when given no iterables", t => {
    t.deepEqual([...zip([])], []);
});

test("closes the iterables that did not finish when the shortest ends", t => {
    const long = tracked([1, 2, 3]);
    const short = tracked([1]);
    t.deepEqual([...zip([long.iterable, short.iterable])], [[1, 1]]);
    t.true(long.closed());
    t.false(short.closed());
});

test("closes every iterable when the consumer stops early", t => {
    const a = tracked([1, 2]);
    const b = tracked([1, 2]);
    const zipped = zip([a.iterable, b.iterable]);
    zipped.next();
    zipped.return();
    t.true(a.closed());
    t.true(b.closed());
});

test("strict mode accepts iterables of equal length", t => {
    t.deepEqual([...zip([[1, 2], [3, 4]], { mode: "strict" })], [[1, 3], [2, 4]]);
});

test("strict mode throws when the first iterable is shorter, closing the rest", t => {
    const long = tracked([1, 2]);
    t.throws(() => [...zip([[1], long.iterable], { mode: "strict" })], { instanceOf: TypeError });
    t.true(long.closed());
});

test("strict mode throws when a later iterable is shorter, closing the first", t => {
    const long = tracked([1, 2]);
    t.throws(() => [...zip([long.iterable, [1]], { mode: "strict" })], { instanceOf: TypeError });
    t.true(long.closed());
});

test("does not close an iterator that threw, but closes the others", t => {
    const other = tracked([1, 2]);
    const throwing = {
        [Symbol.iterator]: () => ({
            next: (): IteratorResult<number> => {
                throw new Error("boom");
            },
            return: (): IteratorResult<number> => {
                throw new Error("must not be closed");
            },
        }),
    };
    t.throws(() => [...zip([other.iterable, throwing])], { message: "boom" });
    t.true(other.closed());
});
