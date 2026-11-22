import test from "ava";
import { createEventLoopMonitor } from "./event-loop.js";

test("summarizes a bounded event-loop overrun history", t => {
    let callback: (() => void) | undefined;
    let monotonicNow = 0;
    let wallNow = 1_000;
    let unrefCount = 0;
    let delay = 0;
    const timer = {
        unref() {
            unrefCount++;
            return this;
        },
    } as unknown as NodeJS.Timeout;

    const monitor = createEventLoopMonitor(
        1_000,
        2,
        () => monotonicNow,
        () => wallNow,
        (scheduled, scheduledDelay) => {
            callback = scheduled;
            delay = scheduledDelay;
            return timer;
        },
    );

    t.is(delay, 1_000);
    t.is(unrefCount, 1);

    monotonicNow = 1_010;
    wallNow = 2_010;
    callback?.();
    monotonicNow = 3_050;
    wallNow = 4_050;
    callback?.();
    monotonicNow = 4_100;
    wallNow = 5_100;
    callback?.();

    t.deepEqual(monitor.snapshot(), {
        intervalMs: 1_000,
        maxOverrunMs: 1_040,
        meanOverrunMs: 545,
        p95OverrunMs: 1_040,
        recent: [
            { at: 4_050, overrunMs: 1_040 },
            { at: 5_100, overrunMs: 50 },
        ],
        sampleCount: 2,
    });
});
