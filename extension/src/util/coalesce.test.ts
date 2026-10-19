import test from "ava";
import { coalesce } from "./coalesce.js";

function gatedCalls(): { calls: number[]; gates: PromiseWithResolvers<void>[]; fn: (i: number) => Promise<number> } {
    const calls: number[] = [];
    const gates: PromiseWithResolvers<void>[] = [];
    return {
        calls,
        gates,
        fn: async (i: number) => {
            calls.push(i);
            const gate = Promise.withResolvers<void>();
            gates.push(gate);
            await gate.promise;
            return i;
        },
    };
}

test("Runs immediately when idle", async t => {
    const coalesced = coalesce(async (x: number) => x * 2);
    t.is(await coalesced(2), 4);
    t.is(await coalesced(3), 6);
});

test("Merges calls made while busy into a single follow-up run", async t => {
    const { calls, gates, fn } = gatedCalls();
    const coalesced = coalesce(fn);

    const first = coalesced(1);
    const second = coalesced(2);
    const third = coalesced(3);
    const fourth = coalesced(4);

    t.is(second, third);
    t.is(third, fourth);
    t.deepEqual(calls, [1]);

    gates[0]!.resolve();
    t.is(await first, 1);
    await new Promise(resolve => setImmediate(resolve));
    t.deepEqual(calls, [1, 2]);

    gates[1]!.resolve();
    t.deepEqual(await Promise.all([second, third, fourth]), [2, 2, 2]);
    t.deepEqual(calls, [1, 2]);
});

test("Starts a new follow-up once the previous follow-up is running", async t => {
    const { calls, gates, fn } = gatedCalls();
    const coalesced = coalesce(fn);

    const first = coalesced(1);
    const second = coalesced(2);
    gates[0]!.resolve();
    await first;
    await new Promise(resolve => setImmediate(resolve));

    const third = coalesced(3);
    t.not(third, second);
    gates[1]!.resolve();
    await second;
    await new Promise(resolve => setImmediate(resolve));
    gates[2]!.resolve();

    t.is(await third, 3);
    t.deepEqual(calls, [1, 2, 3]);
});

test("Runs the follow-up after the current run rejects or throws synchronously", async t => {
    let calls = 0;
    const coalesced = coalesce((mode: "throw" | "ok") => {
        calls++;
        if (mode === "throw") {
            throw new Error("sync");
        }
        return Promise.resolve(mode);
    });

    const first = coalesced("throw");
    const second = coalesced("ok");

    await t.throwsAsync(first, { message: "sync" });
    t.is(await second, "ok");
    t.is(calls, 2);
});

test("Keeps state per wrapper", async t => {
    const { calls, gates, fn } = gatedCalls();
    const a = coalesce(fn);
    const b = coalesce(fn);

    const pending = [a(1), b(2)];
    t.deepEqual(calls, [1, 2]);
    gates.forEach(gate => gate.resolve());
    t.deepEqual(await Promise.all(pending), [1, 2]);
});

test("Preserves the this binding of the wrapper", async t => {
    const obj = {
        value: 42,
        get: coalesce(async function(this: { value: number }) {
            return this.value;
        }),
    };
    t.is(await obj.get(), 42);
});
