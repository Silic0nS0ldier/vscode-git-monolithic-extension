import test from "ava";
import { createCachedLookup } from "./cached-lookup.js";

function countingLookup<T>(results: (() => Promise<T>)[]): { calls: () => number; load: () => Promise<T> } {
    let calls = 0;
    return {
        calls: () => calls,
        load: () => results[calls++]!(),
    };
}

test("Loads once until invalidated", async t => {
    const { calls, load } = countingLookup([async () => "first", async () => "second"]);
    const lookup = createCachedLookup(load);

    t.is(await lookup.get(), "first");
    t.is(await lookup.get(), "first");
    t.is(calls(), 1);

    lookup.invalidate();
    t.is(await lookup.get(), "second");
    t.is(calls(), 2);
});

test("Concurrent callers share one load", async t => {
    const { calls, load } = countingLookup([async () => "only"]);
    const lookup = createCachedLookup(load);

    t.deepEqual(await Promise.all([lookup.get(), lookup.get()]), ["only", "only"]);
    t.is(calls(), 1);
});

test("A failed load is retried by the next caller", async t => {
    const { calls, load } = countingLookup([async () => Promise.reject(new Error("unavailable")), async () => "ok"]);
    const lookup = createCachedLookup(load);

    await t.throwsAsync(lookup.get(), { message: "unavailable" });
    t.is(await lookup.get(), "ok");
    t.is(calls(), 2);
});

test("A failed load does not evict one started after invalidating", async t => {
    const failure = Promise.withResolvers<string>();
    const { calls, load } = countingLookup([() => failure.promise, async () => "fresh"]);
    const lookup = createCachedLookup(load);

    const stale = lookup.get();
    lookup.invalidate();
    t.is(await lookup.get(), "fresh");

    failure.reject(new Error("stale"));
    await t.throwsAsync(stale);
    t.is(await lookup.get(), "fresh");
    t.is(calls(), 2);
});
