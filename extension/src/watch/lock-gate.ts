import * as fs from "node:fs";
import * as path from "node:path";

export interface LockGate<TEvent> {
    /**
     * Returns `true` when a lock is held (remembering watchable events to replay once all locks clear), or `false`
     * when unlocked (after flushing any remembered events).
     */
    readonly handle: (event: TEvent, filePath: string, watchable: boolean) => boolean;
    readonly dispose: () => void;
}

/** Transient `.git` lock files held while git is mid-write on `index` or `HEAD`. */
export function transientGitLocks(dotGitDir: string): string[] {
    return [
        path.join(dotGitDir, "index.lock"),
        path.join(dotGitDir, "HEAD.lock"),
    ];
}

/**
 * Suppresses watcher events while any transient lock file exists, watching the lock parent directory on demand so
 * remembered events flush as soon as the lock disappears—even when the main watcher ignores `.git`.
 */
export function createLockGate<TEvent>(
    locks: readonly string[],
    important: readonly string[],
    onRecall: (recalled: ReadonlyMap<string, TEvent>) => void,
): LockGate<TEvent> {
    const lockEvents = new Map<string, TEvent>();
    const lockDirs = [...new Set(locks.map(lock => path.dirname(lock)))];
    let releaseWatchers: fs.FSWatcher[] = [];
    let disposed = false;

    function isLocked(): boolean {
        return locks.some(fs.existsSync);
    }

    function stopReleaseWatchers(): void {
        for (const watcher of releaseWatchers) {
            watcher.close();
        }
        releaseWatchers = [];
    }

    function flushIfUnlocked(): boolean {
        if (disposed) {
            return false;
        }
        if (isLocked()) {
            return true;
        }
        stopReleaseWatchers();
        if (lockEvents.size > 0) {
            const snapshot = new Map(lockEvents);
            lockEvents.clear();
            onRecall(snapshot);
        }
        return false;
    }

    function ensureReleaseWatchers(): void {
        if (disposed || releaseWatchers.length > 0 || lockDirs.length === 0) {
            return;
        }
        for (const dir of lockDirs) {
            try {
                const watcher = fs.watch(dir, () => {
                    flushIfUnlocked();
                });
                watcher.on("error", () => {
                    flushIfUnlocked();
                });
                releaseWatchers.push(watcher);
            } catch {
                // Directory missing or unwatchable; the re-check below handles already-cleared locks.
            }
        }
        // Guard against the lock disappearing between `isLocked()` and `fs.watch(...)` attaching.
        if (!isLocked()) {
            queueMicrotask(() => {
                flushIfUnlocked();
            });
        }
    }

    return {
        dispose(): void {
            disposed = true;
            lockEvents.clear();
            stopReleaseWatchers();
        },
        handle(event, filePath, watchable): boolean {
            if (disposed) {
                return true;
            }
            if (isLocked()) {
                if (watchable && (lockEvents.size === 0 || important.includes(filePath))) {
                    lockEvents.set(filePath, event);
                    ensureReleaseWatchers();
                }
                return true;
            }
            flushIfUnlocked();
            return false;
        },
    };
}
