/// <reference lib="esnext.iterator" />
// core-js-pure ships no types; `Iterator.zip` itself is typed by TypeScript's `esnext.iterator` lib.
declare module "core-js-pure/modules/es.iterator.zip.js" {}

declare module "core-js-pure/internals/path.js" {
    const path: { Iterator: Pick<IteratorConstructor, "zip"> };
    export = path;
}
