import test from "ava";
import { createScheduler } from "./scheduler.js";

function recorder(): {
    log: string[];
    gates: Map<string, PromiseWithResolvers<void>>;
    task: (name: string) => (arg?: unknown) => Promise<string>;
} {
    const log: string[] = [];
    const gates = new Map<string, PromiseWithResolvers<void>>();
    return {
        log,
        gates,
        task: name => async arg => {
            const label = arg === undefined ? name : `${name}(${String(arg)})`;
            log.push(`start ${label}`);
            const gate = Promise.withResolvers<void>();
            gates.set(label, gate);
            await gate.promise;
            log.push(`end ${label}`);
            return label;
        },
    };
}

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

test("Runs one task at a time across all wrapped functions, in call order", async t => {
    const { log, gates, task } = recorder();
    const scheduler = createScheduler();
    const pull = scheduler.coalesced(task("pull"));
    const push = scheduler.coalesced(task("push"));
    const pullFrom = scheduler.exclusive(task("pullFrom"));

    const results = [pull(), push(), pullFrom("origin")];
    t.deepEqual(log, ["start pull"]);

    gates.get("pull")!.resolve();
    await tick();
    t.deepEqual(log, ["start pull", "end pull", "start push"]);

    gates.get("push")!.resolve();
    await tick();
    gates.get("pullFrom(origin)")!.resolve();

    t.deepEqual(await Promise.all(results), ["pull", "push", "pullFrom(origin)"]);
    t.deepEqual(log, [
        "start pull",
        "end pull",
        "start push",
        "end push",
        "start pullFrom(origin)",
        "end pullFrom(origin)",
    ]);
});

test("Merges queued calls only with calls to the same coalesced function", async t => {
    const { log, gates, task } = recorder();
    const scheduler = createScheduler();
    const fetch = scheduler.coalesced(task("fetch"));
    const pull = scheduler.coalesced(task("pull"));
    const push = scheduler.coalesced(task("push"));

    const first = fetch(1);
    const pullA = pull(1);
    const pushA = push(1);
    const pullB = pull(2);
    const pushB = push(2);

    t.is(pullA, pullB);
    t.is(pushA, pushB);

    gates.get("fetch(1)")!.resolve();
    await tick();
    gates.get("pull(1)")!.resolve();
    await tick();
    gates.get("push(1)")!.resolve();

    t.deepEqual(await Promise.all([first, pullA, pushA]), ["fetch(1)", "pull(1)", "push(1)"]);
    t.deepEqual(log, [
        "start fetch(1)",
        "end fetch(1)",
        "start pull(1)",
        "end pull(1)",
        "start push(1)",
        "end push(1)",
    ]);
});

test("Keeps the queue position of the first merged call", async t => {
    const { log, gates, task } = recorder();
    const scheduler = createScheduler();
    const fetch = scheduler.coalesced(task("fetch"));
    const pull = scheduler.coalesced(task("pull"));
    const push = scheduler.coalesced(task("push"));

    const running = fetch();
    const queuedPull = pull();
    const queuedPush = push();
    t.is(pull(), queuedPull);

    gates.get("fetch")!.resolve();
    await tick();
    gates.get("pull")!.resolve();
    await tick();
    gates.get("push")!.resolve();

    await Promise.all([running, queuedPull, queuedPush]);
    t.deepEqual(log, ["start fetch", "end fetch", "start pull", "end pull", "start push", "end push"]);
});

test("Queues a new call to a coalesced function once its earlier call has started", async t => {
    const { log, gates, task } = recorder();
    const scheduler = createScheduler();
    const pull = scheduler.coalesced(task("pull"));

    const first = pull(1);
    const second = pull(2);
    t.not(first, second);
    t.is(pull(3), second);

    gates.get("pull(1)")!.resolve();
    await tick();
    const third = pull(4);
    t.not(third, second);

    gates.get("pull(2)")!.resolve();
    await tick();
    gates.get("pull(4)")!.resolve();

    t.deepEqual(await Promise.all([first, second, third]), ["pull(1)", "pull(2)", "pull(4)"]);
    t.deepEqual(log, ["start pull(1)", "end pull(1)", "start pull(2)", "end pull(2)", "start pull(4)", "end pull(4)"]);
});

test("Never merges calls to an exclusive function", async t => {
    const { gates, task } = recorder();
    const scheduler = createScheduler();
    const pullFrom = scheduler.exclusive(task("pullFrom"));

    const results = [pullFrom("a"), pullFrom("b"), pullFrom("b")];
    t.not(results[1], results[2]);

    for (const label of ["pullFrom(a)", "pullFrom(b)", "pullFrom(b)"]) {
        gates.get(label)!.resolve();
        await tick();
    }

    t.deepEqual(await Promise.all(results), ["pullFrom(a)", "pullFrom(b)", "pullFrom(b)"]);
});

test("Moves on to the next task after one rejects or throws synchronously", async t => {
    const scheduler = createScheduler();
    const rejects = scheduler.coalesced(() => Promise.reject(new Error("async")));
    const throws = scheduler.exclusive((): Promise<void> => {
        throw new Error("sync");
    });
    const ok = scheduler.coalesced(async () => "ok");

    const results = [rejects(), throws(), ok()];

    await t.throwsAsync(results[0]!, { message: "async" });
    await t.throwsAsync(results[1]!, { message: "sync" });
    t.is(await results[2], "ok");
});

test("Keeps separate schedulers independent", async t => {
    const { log, gates, task } = recorder();
    const a = createScheduler().coalesced(task("a"));
    const b = createScheduler().coalesced(task("b"));

    const results = [a(), b()];
    t.deepEqual(log, ["start a", "start b"]);
    gates.forEach(gate => gate.resolve());
    await Promise.all(results);
});

test("Preserves the this binding of wrapped functions", async t => {
    const scheduler = createScheduler();
    const obj = {
        value: 42,
        exclusive: scheduler.exclusive(async function(this: { value: number }) {
            return this.value;
        }),
        coalesced: scheduler.coalesced(async function(this: { value: number }) {
            return this.value;
        }),
    };
    t.deepEqual(await Promise.all([obj.exclusive(), obj.coalesced()]), [42, 42]);
});
