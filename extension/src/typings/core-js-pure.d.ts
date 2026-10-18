// core-js-pure ships no types; signature from https://core-js.io/docs/features/proposals/joint-iteration
declare module "core-js-pure/modules/es.iterator.zip.js" {}

declare module "core-js-pure/internals/path.js" {
    function zip<const T extends readonly Iterable<unknown>[]>(
        iterables: T,
        options?: {
            mode?: "shortest" | "longest" | "strict";
            padding?: { [K in keyof T]?: T[K] extends Iterable<infer U> ? U : never };
        },
    ): IterableIterator<{ -readonly [K in keyof T]: T[K] extends Iterable<infer U> ? U : never }>;
    const path: { Iterator: { zip: typeof zip } };
    export = path;
}
