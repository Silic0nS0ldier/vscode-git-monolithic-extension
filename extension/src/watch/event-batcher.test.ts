import test from "ava";
import { setTimeout as delay } from "node:timers/promises";
import type { WatchEvent } from "./backend.js";
import { createEventBatcher } from "./event-batcher.js";

test("Debounces to one latest event per path after changes stop", async t => {
    const events: WatchEvent[] = [];
    const batcher = createEventBatcher(10, event => events.push(event));

    batcher.push({ event: "add", path: "/repo/a.txt", watchable: true });
    batcher.push({ event: "change", path: "/repo/a.txt", watchable: true });
    batcher.push({ event: "change", path: "/repo/b.txt", watchable: true });
    await delay(20);

    t.deepEqual(events, [
        { event: "change", path: "/repo/a.txt", watchable: true },
        { event: "change", path: "/repo/b.txt", watchable: true },
    ]);
    batcher.dispose();
});

test("Keeps a watchable event when a directory event follows for the same path", async t => {
    const events: WatchEvent[] = [];
    const batcher = createEventBatcher(0, event => events.push(event));

    batcher.push({ event: "change", path: "/repo/file", watchable: true });
    batcher.push({ event: "unlinkDir", path: "/repo/file", watchable: false });
    await delay(10);

    t.deepEqual(events, [
        { event: "change", path: "/repo/file", watchable: true },
    ]);
    batcher.dispose();
});

test("Drops pending events when disposed", async t => {
    const events: WatchEvent[] = [];
    const batcher = createEventBatcher(10, event => events.push(event));

    batcher.push({ event: "change", path: "/repo/file", watchable: true });
    batcher.dispose();
    await delay(20);

    t.deepEqual(events, []);
});
