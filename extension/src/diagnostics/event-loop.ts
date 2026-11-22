import { performance } from "node:perf_hooks";

const INTERVAL_MS = 1_000;
const CAPACITY = 180;

export interface EventLoopSample {
    readonly at: number;
    readonly overrunMs: number;
}

export interface EventLoopSnapshot {
    readonly intervalMs: number;
    readonly maxOverrunMs: number;
    readonly meanOverrunMs: number;
    readonly p95OverrunMs: number;
    readonly recent: readonly EventLoopSample[];
    readonly sampleCount: number;
}

export interface EventLoopMonitor {
    dispose(): void;
    snapshot(): EventLoopSnapshot;
}

function percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index] ?? 0;
}

export function createEventLoopMonitor(
    intervalMs = INTERVAL_MS,
    capacity = CAPACITY,
    monotonicNow: () => number = () => performance.now(),
    wallNow: () => number = Date.now,
    schedule: (callback: () => void, delayMs: number) => NodeJS.Timeout = setInterval,
): EventLoopMonitor {
    const samples: EventLoopSample[] = [];
    let expectedAt = monotonicNow();

    const timer = schedule(() => {
        const now = monotonicNow();
        const elapsedMs = now - expectedAt;
        expectedAt = now;
        samples.push({
            at: wallNow(),
            overrunMs: Math.max(0, elapsedMs - intervalMs),
        });
        if (samples.length > capacity) {
            samples.splice(0, samples.length - capacity);
        }
    }, intervalMs);
    timer.unref();

    return {
        dispose() {
            clearInterval(timer);
        },
        snapshot() {
            const overruns = samples.map(sample => sample.overrunMs).toSorted((a, b) => a - b);
            const total = overruns.reduce((sum, value) => sum + value, 0);
            return {
                intervalMs,
                maxOverrunMs: overruns.at(-1) ?? 0,
                meanOverrunMs: overruns.length === 0 ? 0 : total / overruns.length,
                p95OverrunMs: percentile(overruns, 95),
                recent: [...samples.filter(sample => sample.overrunMs >= 25).toReversed().slice(0, 40)].toReversed(),
                sampleCount: samples.length,
            };
        },
    };
}
