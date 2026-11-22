import type { WatchEvent } from "./backend.js";

export type EventBatcher = {
    readonly dispose: () => void;
    readonly push: (event: WatchEvent) => void;
};

export function createEventBatcher(
    debounceMs: number,
    onEvent: (event: WatchEvent) => void,
): EventBatcher {
    const pending = new Map<string, WatchEvent>();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function flush(): void {
        timer = undefined;
        if (disposed) {
            return;
        }
        const events = [...pending.values()];
        pending.clear();
        for (const event of events) {
            onEvent(event);
        }
    }

    return {
        dispose(): void {
            disposed = true;
            pending.clear();
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
        },
        push(event): void {
            if (disposed) {
                return;
            }

            const previous = pending.get(event.path);
            if (previous?.watchable === true && !event.watchable) {
                pending.set(event.path, previous);
            } else {
                pending.set(event.path, event);
            }

            if (timer !== undefined) {
                clearTimeout(timer);
            }
            timer = setTimeout(flush, Math.max(0, debounceMs));
        },
    };
}
