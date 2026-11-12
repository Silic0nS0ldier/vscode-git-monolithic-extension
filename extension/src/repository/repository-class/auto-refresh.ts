import type { Disposable } from "vscode";

export interface AutoRefresherDeps {
    readonly cooldownMs: () => number;
    readonly debounceMs: () => number;
    readonly now?: () => number;
    readonly onError: (err: unknown) => void;
    readonly refresh: () => Promise<void>;
    readonly scheduleTimer?: (callback: () => void, delayMs: number) => () => void;
    readonly whenReady: () => Promise<void>;
}

function defaultScheduleTimer(callback: () => void, delayMs: number): () => void {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
}

/**
 * Schedules automatic refreshes so each run waits for both any post-refresh cooldown and a full trailing quiet
 * window (`debounceMs`) after the latest request, preventing mid-burst refreshes when cooldown expires during an
 * ongoing operation such as `git rebase`.
 */
export function createAutoRefresher(deps: AutoRefresherDeps): { readonly request: () => void } & Disposable {
    const now = deps.now ?? Date.now;
    const scheduleTimer = deps.scheduleTimer ?? defaultScheduleTimer;
    let disposed = false;
    let running = false;
    let dirty = false;
    let lastRequestAt = 0;
    let cooldownUntil = 0;
    let cancelTimer: (() => void) | undefined;

    function clearPendingTimer(): void {
        cancelTimer?.();
        cancelTimer = undefined;
    }

    function dueAt(): number {
        return Math.max(cooldownUntil, lastRequestAt + Math.max(0, deps.debounceMs()));
    }

    function schedule(): void {
        clearPendingTimer();
        if (disposed || !dirty || running) {
            return;
        }
        const delayMs = Math.max(0, dueAt() - now());
        cancelTimer = scheduleTimer(() => {
            void tick();
        }, delayMs);
    }

    async function tick(): Promise<void> {
        cancelTimer = undefined;
        if (disposed || !dirty || running) {
            return;
        }
        running = true;
        try {
            while (!disposed && dirty) {
                await deps.whenReady();
                if (disposed) {
                    return;
                }
                if (now() < dueAt()) {
                    // Requests arrived while waiting to become ready; let the timer wait out the quiet window.
                    break;
                }
                dirty = false;
                try {
                    await deps.refresh();
                } catch (err) {
                    deps.onError(err);
                }
                const cooldown = Math.max(0, deps.cooldownMs());
                cooldownUntil = cooldown > 0 ? now() + cooldown : 0;
                if (dirty) {
                    break;
                }
            }
        } finally {
            running = false;
            if (!disposed && dirty) {
                schedule();
            }
        }
    }

    return {
        dispose(): void {
            disposed = true;
            dirty = false;
            clearPendingTimer();
        },
        request(): void {
            if (disposed) {
                return;
            }
            dirty = true;
            lastRequestAt = now();
            if (!running) {
                schedule();
            }
        },
    };
}
