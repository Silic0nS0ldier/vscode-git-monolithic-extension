export interface ScheduleOptions {
    /**
     * Calls sharing a key join a queued (not yet started) task instead of queuing again; the joining call's `task` is
     * discarded. Once a task starts, a new call with its key queues afresh. Omit to always queue.
     *
     * The key must capture everything that changes what the task does. Read mutable state inside the task rather
     * than capturing it at call time, as a queued task runs later.
     */
    readonly key?: string;
    /**
     * Aborting rejects this call immediately with `signal.reason`. The task itself is only abandoned once every call
     * sharing it has aborted: removed from the queue if it has not started, otherwise its own signal is aborted (it
     * keeps its turn in the queue until it settles).
     */
    readonly signal?: AbortSignal;
}

export interface Scheduler {
    readonly schedule: <T>(options: ScheduleOptions, task: (signal: AbortSignal) => Promise<T>) => Promise<T>;
}

interface Entry {
    readonly controller: AbortController;
    readonly key: string | undefined;
    readonly promise: Promise<unknown>;
    readonly start: () => void;
    callers: number;
    started: boolean;
}

/**
 * Creates a FIFO queue that runs one task at a time. A task starts synchronously when the queue is idle.
 */
export function createScheduler(): Scheduler {
    let active = false;
    const queue: Entry[] = [];
    const queuedByKey = new Map<string, Entry>();

    function startNext(): void {
        const next = queue.shift();
        if (next) {
            next.start();
        } else {
            active = false;
        }
    }

    function forget(entry: Entry): void {
        if (entry.key !== undefined && queuedByKey.get(entry.key) === entry) {
            queuedByKey.delete(entry.key);
        }
    }

    function createEntry<T>(key: string | undefined, task: (signal: AbortSignal) => Promise<T>): Entry {
        const controller = new AbortController();
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        // Every caller may abort and stop listening while the task is still running.
        promise.catch(() => {});
        const entry: Entry = {
            callers: 0,
            controller,
            key,
            promise,
            start() {
                entry.started = true;
                forget(entry);
                const run = async (): Promise<T> => {
                    try {
                        return await task(controller.signal);
                    } finally {
                        startNext();
                    }
                };
                run().then(resolve, reject);
            },
            started: false,
        };
        return entry;
    }

    function leave(entry: Entry, reason: unknown): void {
        entry.callers--;
        if (entry.callers > 0) {
            return;
        }
        if (entry.started) {
            entry.controller.abort(reason);
        } else {
            forget(entry);
            queue.splice(queue.indexOf(entry), 1);
        }
    }

    return {
        schedule<T>({ key, signal }: ScheduleOptions, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
            if (signal?.aborted) {
                return Promise.reject(signal.reason);
            }

            let entry = key === undefined ? undefined : queuedByKey.get(key);
            if (!entry) {
                entry = createEntry(key, task);
                if (active) {
                    queue.push(entry);
                    if (key !== undefined) {
                        queuedByKey.set(key, entry);
                    }
                } else {
                    active = true;
                    entry.start();
                }
            }
            entry.callers++;

            const shared = entry.promise as Promise<T>;
            if (!signal) {
                return shared;
            }

            const joined = entry;
            const { promise, resolve, reject } = Promise.withResolvers<T>();
            let settled = false;
            const onAbort = (): void => {
                if (!settled) {
                    reject(signal.reason);
                    leave(joined, signal.reason);
                }
            };
            signal.addEventListener("abort", onAbort, { once: true });
            shared.then(resolve, reject).finally(() => {
                settled = true;
                signal.removeEventListener("abort", onAbort);
            });
            return promise;
        },
    };
}
