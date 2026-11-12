import test from "ava";
import { createAutoRefresher } from "./auto-refresh.js";

function createFakeClock() {
    let current = 0;
    let nextId = 1;
    const timers = new Map<number, { readonly due: number; readonly callback: () => void }>();

    async function flushMicrotasks(): Promise<void> {
        for (let i = 0; i < 6; i++) {
            await Promise.resolve();
        }
    }

    return {
        async advance(ms: number): Promise<void> {
            const target = current + ms;
            while (true) {
                let earliest: [number, { readonly due: number; readonly callback: () => void }] | undefined;
                for (const entry of timers.entries()) {
                    if (entry[1].due <= target && (!earliest || entry[1].due < earliest[1].due)) {
                        earliest = entry;
                    }
                }
                if (!earliest) {
                    break;
                }
                timers.delete(earliest[0]);
                current = earliest[1].due;
                earliest[1].callback();
                await flushMicrotasks();
            }
            current = target;
            await flushMicrotasks();
        },
        flushMicrotasks,
        now: () => current,
        pendingTimers: () => timers.size,
        scheduleTimer(this: void, callback: () => void, delayMs: number): () => void {
            const id = nextId++;
            timers.set(id, { callback, due: current + delayMs });
            return () => {
                timers.delete(id);
            };
        },
    };
}

function createHarness(cooldownMs = 5_000, debounceMs = 1_000) {
    const clock = createFakeClock();
    const runs: number[] = [];
    const refresher = createAutoRefresher({
        cooldownMs: () => cooldownMs,
        debounceMs: () => debounceMs,
        now: clock.now,
        onError: err => {
            throw err;
        },
        refresh: () => {
            runs.push(clock.now());
            return Promise.resolve();
        },
        scheduleTimer: clock.scheduleTimer,
        whenReady: async () => {},
    });
    return { clock, refresher, runs };
}

test("Coalesces a burst of requests until a full trailing debounce window of quiet elapses", async t => {
    const { clock, refresher, runs } = createHarness();

    refresher.request();
    await clock.advance(400);
    refresher.request();
    await clock.advance(400);
    refresher.request();
    await clock.advance(999);
    t.deepEqual(runs, []);

    await clock.advance(1);
    t.deepEqual(runs, [1_800]);
});

test("Does not fire at cooldown expiry when requests are still arriving near the end of cooldown", async t => {
    const { clock, refresher, runs } = createHarness();

    // First refresh runs at t=1000; cooldown lasts until t=6000.
    refresher.request();
    await clock.advance(1_000);
    t.deepEqual(runs, [1_000]);

    // An early request at t=2000 plus ongoing rebase bursts at t=5500 and t=5950 push the next run past t=6000.
    await clock.advance(1_000);
    refresher.request();
    await clock.advance(3_500);
    refresher.request();
    await clock.advance(450);
    refresher.request();

    // Cooldown expires at t=6000, 50ms later, while trailing quiet requires waiting until t=6950.
    await clock.advance(50);
    t.deepEqual(runs, [1_000]);

    await clock.advance(949);
    t.deepEqual(runs, [1_000]);

    await clock.advance(1);
    t.deepEqual(runs, [1_000, 6_950]);
});

test("Runs promptly at cooldown expiry when the follow-up request settled well before cooldown ended", async t => {
    const { clock, refresher, runs } = createHarness();

    refresher.request();
    await clock.advance(1_000);
    t.deepEqual(runs, [1_000]);

    // Request at t=2000 (quiet by t=3000, while cooldown lasts until t=6000).
    await clock.advance(1_000);
    refresher.request();
    await clock.advance(3_999);
    t.deepEqual(runs, [1_000]);

    await clock.advance(1);
    t.deepEqual(runs, [1_000, 6_000]);
});

test("Schedules a follow-up refresh when a request arrives while a refresh is running", async t => {
    const clock = createFakeClock();
    const runs: number[] = [];
    let finishFirstRefresh!: () => void;
    let callCount = 0;

    const refresher = createAutoRefresher({
        cooldownMs: () => 2_000,
        debounceMs: () => 1_000,
        now: clock.now,
        onError: err => t.fail(String(err)),
        refresh: async () => {
            runs.push(clock.now());
            if (++callCount === 1) {
                await new Promise<void>(resolve => {
                    finishFirstRefresh = resolve;
                });
            }
        },
        scheduleTimer: clock.scheduleTimer,
        whenReady: async () => {},
    });

    refresher.request();
    await clock.advance(1_000);
    t.deepEqual(runs, [1_000]);

    // Request arrives at t=1500 while first refresh is still in flight; refresh finishes at t=1800.
    await clock.advance(500);
    refresher.request();
    await clock.advance(300);
    finishFirstRefresh();
    await clock.flushMicrotasks();

    // Cooldown ends at t=3800 (1800 + 2000 > 1500 + 1000).
    await clock.advance(1_999);
    t.deepEqual(runs, [1_000]);
    await clock.advance(1);
    t.deepEqual(runs, [1_000, 3_800]);
});

test("Re-checks trailing quiet if new requests arrive while waiting for whenReady", async t => {
    const clock = createFakeClock();
    const runs: number[] = [];
    let unblockReady!: () => void;
    let firstWait = true;

    const refresher = createAutoRefresher({
        cooldownMs: () => 0,
        debounceMs: () => 1_000,
        now: clock.now,
        onError: err => t.fail(String(err)),
        refresh: () => {
            runs.push(clock.now());
            return Promise.resolve();
        },
        scheduleTimer: clock.scheduleTimer,
        whenReady: async () => {
            if (firstWait) {
                firstWait = false;
                await new Promise<void>(resolve => {
                    unblockReady = resolve;
                });
            }
        },
    });

    refresher.request();
    await clock.advance(1_000);
    t.deepEqual(runs, []);

    // While unfocused, another event arrives at t=2500, then window focuses at t=2600.
    await clock.advance(1_500);
    refresher.request();
    await clock.advance(100);
    unblockReady();
    await clock.flushMicrotasks();
    t.deepEqual(runs, []);

    // Must wait until t=3500 (2500 + 1000).
    await clock.advance(899);
    t.deepEqual(runs, []);
    await clock.advance(1);
    t.deepEqual(runs, [3_500]);
});

test("Reports refresh errors via onError and cancels pending work on dispose", async t => {
    const clock = createFakeClock();
    const errors: unknown[] = [];
    const boom = new Error("boom");

    const refresher = createAutoRefresher({
        cooldownMs: () => 1_000,
        debounceMs: () => 500,
        now: clock.now,
        onError: err => errors.push(err),
        refresh: () => {
            throw boom;
        },
        scheduleTimer: clock.scheduleTimer,
        whenReady: async () => {},
    });

    refresher.request();
    await clock.advance(500);
    t.deepEqual(errors, [boom]);

    refresher.request();
    t.is(clock.pendingTimers(), 1);
    refresher.dispose();
    t.is(clock.pendingTimers(), 0);
    await clock.advance(5_000);
    t.deepEqual(errors, [boom]);
});
