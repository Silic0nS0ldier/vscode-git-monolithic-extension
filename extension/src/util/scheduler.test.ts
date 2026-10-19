import test from "ava";
import { createScheduler, type ScheduleOptions } from "./scheduler.js";

function recorder(): {
    log: string[];
    gates: Map<string, PromiseWithResolvers<void>>;
    signals: Map<string, AbortSignal>;
    schedule: (label: string, options?: ScheduleOptions) => Promise<string>;
} {
    const scheduler = createScheduler();
    const log: string[] = [];
    const gates = new Map<string, PromiseWithResolvers<void>>();
    const signals = new Map<string, AbortSignal>();
    return {
        log,
        gates,
        signals,
        schedule: (label, options = {}) =>
            scheduler.schedule(options, async signal => {
                log.push(`start ${label}`);
                signals.set(label, signal);
                const gate = Promise.withResolvers<void>();
                gates.set(label, gate);
                await gate.promise;
                log.push(`end ${label}`);
                return label;
            }),
    };
}

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

async function finish(gates: Map<string, PromiseWithResolvers<void>>, ...labels: string[]): Promise<void> {
    for (const label of labels) {
        gates.get(label)!.resolve();
        await tick();
    }
}

test("Runs one task at a time in call order", async t => {
    const { log, gates, schedule } = recorder();

    const results = [schedule("pull", { key: "pull" }), schedule("push", { key: "push" }), schedule("pullFrom")];
    t.deepEqual(log, ["start pull"]);

    await finish(gates, "pull");
    t.deepEqual(log, ["start pull", "end pull", "start push"]);

    await finish(gates, "push", "pullFrom");
    t.deepEqual(await Promise.all(results), ["pull", "push", "pullFrom"]);
    t.deepEqual(log, ["start pull", "end pull", "start push", "end push", "start pullFrom", "end pullFrom"]);
});

test("Merges a call into a queued task with the same key, keeping the queue position of the first call", async t => {
    const { log, gates, schedule } = recorder();

    const running = schedule("fetch", { key: "fetch" });
    const pullA = schedule("pull A", { key: "pull" });
    const push = schedule("push", { key: "push" });
    const pullB = schedule("pull B", { key: "pull" });

    await finish(gates, "fetch", "pull A", "push");

    t.deepEqual(await Promise.all([running, pullA, push, pullB]), ["fetch", "pull A", "push", "pull A"]);
    t.deepEqual(log, ["start fetch", "end fetch", "start pull A", "end pull A", "start push", "end push"]);
});

test("Never merges calls with different keys or without a key", async t => {
    const { log, gates, schedule } = recorder();

    const results = [
        schedule("running"),
        schedule("push", { key: "push" }),
        schedule("force push", { key: "push --force" }),
        schedule("pullFrom 1"),
        schedule("pullFrom 2"),
    ];

    await finish(gates, "running", "push", "force push", "pullFrom 1", "pullFrom 2");

    t.deepEqual(await Promise.all(results), ["running", "push", "force push", "pullFrom 1", "pullFrom 2"]);
    t.is(log.length, 10);
});

test("Queues a new task for a key once the earlier task with that key has started", async t => {
    const { log, gates, schedule } = recorder();

    const first = schedule("pull 1", { key: "pull" });
    const second = schedule("pull 2", { key: "pull" });
    const merged = schedule("pull 3", { key: "pull" });

    await finish(gates, "pull 1");
    const third = schedule("pull 4", { key: "pull" });
    await finish(gates, "pull 2", "pull 4");

    t.deepEqual(await Promise.all([first, second, merged, third]), ["pull 1", "pull 2", "pull 2", "pull 4"]);
    t.deepEqual(log, ["start pull 1", "end pull 1", "start pull 2", "end pull 2", "start pull 4", "end pull 4"]);
});

test("Moves on to the next task after one rejects or throws synchronously", async t => {
    const scheduler = createScheduler();

    const results = [
        scheduler.schedule({}, () => Promise.reject(new Error("async"))),
        scheduler.schedule({}, (): Promise<void> => {
            throw new Error("sync");
        }),
        scheduler.schedule({}, async () => "ok"),
    ];

    await t.throwsAsync(results[0]!, { message: "async" });
    await t.throwsAsync(results[1]!, { message: "sync" });
    t.is(await results[2], "ok");
});

test("Keeps separate schedulers independent", async t => {
    const a = recorder();
    const b = recorder();

    const results = [a.schedule("a"), b.schedule("b")];
    t.deepEqual([...a.log, ...b.log], ["start a", "start b"]);

    await finish(a.gates, "a");
    await finish(b.gates, "b");
    t.deepEqual(await Promise.all(results), ["a", "b"]);
});

test("Rejects immediately when the signal is already aborted, without queuing", async t => {
    const { log, gates, schedule } = recorder();
    const reason = new Error("aborted");

    const running = schedule("running");
    await t.throwsAsync(schedule("pull", { key: "pull", signal: AbortSignal.abort(reason) }), { is: reason });
    const pull = schedule("pull again", { key: "pull" });

    await finish(gates, "running", "pull again");
    t.deepEqual(await Promise.all([running, pull]), ["running", "pull again"]);
    t.deepEqual(log, ["start running", "end running", "start pull again", "end pull again"]);
});

test("Removes a queued task from the queue when its only caller aborts", async t => {
    const { log, gates, schedule } = recorder();
    const controller = new AbortController();
    const reason = new Error("aborted");

    const running = schedule("running");
    const pull = schedule("pull", { key: "pull", signal: controller.signal });
    const push = schedule("push");

    controller.abort(reason);
    await t.throwsAsync(pull, { is: reason });

    await finish(gates, "running", "push");
    t.deepEqual(await Promise.all([running, push]), ["running", "push"]);
    t.deepEqual(log, ["start running", "end running", "start push", "end push"]);

    const later = schedule("pull later", { key: "pull" });
    await finish(gates, "pull later");
    t.is(await later, "pull later");
});

test("Rejects an aborting caller immediately but keeps the task for callers still waiting on it", async t => {
    const { gates, schedule, signals } = recorder();
    const controller = new AbortController();
    const reason = new Error("aborted");

    const running = schedule("running");
    const aborting = schedule("pull", { key: "pull", signal: controller.signal });
    const waiting = schedule("pull", { key: "pull" });

    controller.abort(reason);
    await t.throwsAsync(aborting, { is: reason });

    await finish(gates, "running");
    t.false(signals.get("pull")!.aborted);
    await finish(gates, "pull");
    t.deepEqual(await Promise.all([running, waiting]), ["running", "pull"]);
});

test("Aborts a running task only once every caller sharing it has aborted", async t => {
    const { gates, schedule, signals } = recorder();
    const first = new AbortController();
    const second = new AbortController();
    const reason = new Error("aborted");

    const running = schedule("running");
    const a = schedule("pull", { key: "pull", signal: first.signal });
    const b = schedule("pull", { key: "pull", signal: second.signal });
    await finish(gates, "running");

    first.abort(new Error("first"));
    await t.throwsAsync(a, { message: "first" });
    t.false(signals.get("pull")!.aborted);

    second.abort(reason);
    await t.throwsAsync(b, { is: reason });
    t.true(signals.get("pull")!.aborted);
    t.is(signals.get("pull")!.reason, reason);
    t.is(await running, "running");
});

test("Holds the queue until an aborted running task settles", async t => {
    const { log, gates, schedule } = recorder();
    const controller = new AbortController();

    const pull = schedule("pull", { signal: controller.signal });
    const push = schedule("push");

    controller.abort();
    await t.throwsAsync(pull);
    await tick();
    t.deepEqual(log, ["start pull"]);

    await finish(gates, "pull", "push");
    t.is(await push, "push");
    t.deepEqual(log, ["start pull", "end pull", "start push", "end push"]);
});

test("Ignores an abort after the caller's task has settled", async t => {
    const { gates, schedule, signals } = recorder();
    const controller = new AbortController();

    const pull = schedule("pull", { signal: controller.signal });
    await finish(gates, "pull");
    t.is(await pull, "pull");

    controller.abort();
    t.false(signals.get("pull")!.aborted);
});
