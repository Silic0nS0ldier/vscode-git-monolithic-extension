// Minimal `Iterator.zip` (TC39 joint iteration) covering the `shortest` and `strict` modes.
// TODO(Silic0nS0ldier): Switch to native `Iterator.zip` once the extension host is on Electron >=45
// (V8 >=15.3); it is behind `--js-joint-iteration` in Electron 43/44.
// No upstream issue tracks Electron 45 yet; closest is https://github.com/microsoft/vscode/issues/338363 (Electron 44).

type ZipMode = "shortest" | "strict";

type ZipValues<T extends readonly Iterable<unknown>[]> = {
    -readonly [K in keyof T]: T[K] extends Iterable<infer V> ? V : never;
};

/**
 * Yields arrays of the values at each position of `iterables`.
 * `shortest` (default) stops with the first exhausted iterable, `strict` throws a `TypeError` unless all are exhausted
 * together. Iterators that did not finish are closed on every exit.
 */
export function* zip<const T extends readonly Iterable<unknown>[]>(
    iterables: T,
    options: { mode?: ZipMode } = {},
): Generator<ZipValues<T>, void, undefined> {
    const strict = options.mode === "strict";
    // A slot is cleared once its iterator finished or threw, as those must not be closed.
    const open: (Iterator<unknown> | undefined)[] = [];
    let failure: { error: unknown } | undefined;

    try {
        for (const iterable of iterables) {
            open.push(iterable[Symbol.iterator]());
        }
        if (open.length === 0) {
            return;
        }

        for (;;) {
            const values: unknown[] = [];
            let firstDone = false;
            for (let i = 0; i < open.length; i++) {
                const iterator = open[i]!;
                open[i] = undefined;
                const result = iterator.next();
                if (result.done) {
                    if (!strict) {
                        return;
                    }
                    if (i === 0) {
                        firstDone = true;
                    } else if (!firstDone) {
                        throw new TypeError("zip: iterables have different lengths");
                    }
                } else {
                    open[i] = iterator;
                    if (firstDone) {
                        throw new TypeError("zip: iterables have different lengths");
                    }
                    values.push(result.value);
                }
            }
            if (firstDone) {
                return;
            }
            yield values as ZipValues<T>;
        }
    } catch (error) {
        failure = { error };
        throw error;
    } finally {
        let closeFailure: { error: unknown } | undefined;
        for (const iterator of open) {
            try {
                iterator?.return?.();
            } catch (error) {
                closeFailure ??= { error };
            }
        }
        // An error already in flight takes precedence over one from closing.
        if (closeFailure && !failure) {
            // eslint-disable-next-line no-unsafe-finally -- Deliberately surfaces close errors on otherwise clean exits.
            throw closeFailure.error;
        }
    }
}
