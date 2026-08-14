/**
 * Detach a substring from its parent V8 SeqString so the parent can be GC'd.
 *
 * V8 represents `x.slice()`, `x.substring()`, `x.substr()`, and regex capture
 * groups as `SlicedString` objects that reference the original string's
 * character storage. If the substring outlives the original, the entire
 * original character buffer is retained. When parsing multi-megabyte git
 * outputs into small per-commit fields, this pins the whole buffer for as
 * long as any resulting object is reachable.
 *
 * See https://issues.chromium.org/issues/41480525 — open in V8 since 2015 and
 * still reproducible in Node.js v26.x (production reports as of 2026-07).
 *
 * The `` ` ${x}`.slice(1) `` idiom is one of the very few operations that
 * reliably allocates a fresh `SeqString`:
 *
 *   1. The template literal builds a `ConsString` of `" "` and `x`.
 *   2. `.slice(1)` on a `ConsString` flattens both parts into a new
 *      contiguous `SeqString` for the result, dropping the reference to `x`.
 *
 * Empirically verified in Node 26.5.0 to break the parent-retention chain,
 * unlike all of the following which still leak:
 *
 * - Bare `.slice()`, `.substring()`, `.substr()`
 * - `` `${x}` `` (single-substitution template — V8 optimizes to identity)
 * - `String(x)`, `new String(x).valueOf()`
 * - `x + ""`, `"" + x`
 * - `x.repeat(1)`, `x.normalize()`
 * - `Buffer.from(x, "utf8").toString("utf8")`
 * - `JSON.parse(JSON.stringify(x))`
 * - `Array.from(x).join("")`
 *
 * See `detach.test.ts` for the empirical verification.
 */
export function detach(s: string): string {
    return ` ${s}`.slice(1);
}
