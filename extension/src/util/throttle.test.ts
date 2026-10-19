import test from "ava";
import { throttle } from "./throttle.js";

test("Runs calls one at a time in call order when size is 1", async t => {
    const gates = [0, 1, 2].map(() => Promise.withResolvers<void>());
    const log: string[] = [];
    const limited = throttle(1, async (i: number) => {
        log.push(`start ${i}`);
        await gates[i]!.promise;
        log.push(`end ${i}`);
        return i;
    });

    const results = [limited(0), limited(1), limited(2)];
    await Promise.resolve();
    t.deepEqual(log, ["start 0"]);

    gates[2]!.resolve();
    gates[1]!.resolve();
    gates[0]!.resolve();

    t.deepEqual(await Promise.all(results), [0, 1, 2]);
    t.deepEqual(log, ["start 0", "end 0", "start 1", "end 1", "start 2", "end 2"]);
});

test("Allows up to size calls to run concurrently", async t => {
    let active = 0;
    let peak = 0;
    const limited = throttle(2, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
    });

    await Promise.all([limited(), limited(), limited(), limited(), limited()]);
    t.is(peak, 2);
});

test("Releases the slot when a call rejects or throws synchronously", async t => {
    let calls = 0;
    const limited = throttle(1, (mode: "reject" | "throw" | "ok") => {
        calls++;
        if (mode === "throw") {
            throw new Error("sync");
        }
        return mode === "reject" ? Promise.reject(new Error("async")) : Promise.resolve(mode);
    });

    const first = limited("reject");
    const second = limited("throw");
    const third = limited("ok");

    await t.throwsAsync(first, { message: "async" });
    await t.throwsAsync(second, { message: "sync" });
    t.is(await third, "ok");
    t.is(calls, 3);
});

test("Preserves the this binding of the wrapper", async t => {
    const obj = {
        value: 42,
        get: throttle(1, async function(this: { value: number }) {
            return this.value;
        }),
    };
    t.is(await obj.get(), 42);
});

test("Rejects sizes that are not positive integers", t => {
    for (const size of [0, -1, 1.5, Number.NaN]) {
        t.throws(() => throttle(size, async () => {}), { instanceOf: RangeError });
    }
});
