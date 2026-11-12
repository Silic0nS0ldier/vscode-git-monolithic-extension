import { inspect } from "node:util";
import { Disposable, type Event, EventEmitter, Uri } from "vscode";
import BaseWatcher from "watcher";
import { error, trace, warn } from "../tracing.js";
import * as config from "../util/config.js";
import { createLockGate } from "./lock-gate.js";

type TargetEvent = Parameters<BaseWatcher["event"]>[0];

type Watcher = {
    event: Event<Uri>;
    refresh: () => void;
    suspend: () => SuspendHandle;
} & Disposable;

/** Handle returned by `Watcher.suspend()`; disposing it resumes watching, settling once events flow again. */
export type SuspendHandle = {
    readonly [Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Creates an optimised watcher that signals _something_ changed in the given locations.
 * Excess events (such as those occurring while locks are present) are suppressed.
 */
export function watch(
    locations: [string, ...string[]],
    locks: string[],
    ignoreFn: (path: string) => boolean,
    important: string[],
    id: string,
): Watcher {
    const onFileChangeEmitter = new EventEmitter<Uri>();
    let suspendCount = 0;
    let disposed = false;

    function createWatcher() {
        const lockGate = createLockGate<TargetEvent>(locks, important, recalled => {
            trace(`${id} watcher releasing ${recalled.size} important events`);
            for (const [recallPath, recallEt] of recalled) {
                trace(`${id} watcher recalled event "${recallEt}" "${recallPath}"`);
                onFileChangeEmitter.fire(Uri.file(recallPath));
            }
        });
        const baseWatcher = new BaseWatcher(
            [...locations],
            {
                // TODO Check that file limit is not exceeded (10_000_000)
                //      Use `git ls-files | wc -l` (or similar) to check
                debounce: config.watcherDebounce(),
                ignoreInitial: true,
                renameDetection: false,
                recursive: true,
                ignore: ignoreFn,
            },
            (et, path) => {
                const watchable = isWatchableEvent(et);
                if (lockGate.handle(et, path, watchable)) {
                    return;
                }

                // Filter directory events, only files are of interest
                // TODO Do the individual files also get updated?
                if (watchable) {
                    trace(`${id} watcher event "${et}" "${path}"`);
                    onFileChangeEmitter.fire(Uri.file(path));
                }
            },
        );

        baseWatcher.on("error", err => {
            error(`${id} watcher failed: ${inspect(err)}`);
        });

        return {
            baseWatcher,
            close(): void {
                lockGate.dispose();
                if (!baseWatcher.isClosed()) {
                    baseWatcher.close();
                }
            },
            isClosed: () => baseWatcher.isClosed(),
        };
    }

    let watcher = createWatcher();

    async function release(): Promise<void> {
        if (disposed) {
            warn(`${id} watcher suspend handle disposed after watcher was disposed\n${new Error().stack}`);
            return;
        }
        if (suspendCount === 0) {
            warn(`${id} watcher suspend handle disposed with no active suspend\n${new Error().stack}`);
            return;
        }
        suspendCount--;
        if (suspendCount > 0) {
            return;
        }

        trace(`${id} watcher resuming, re-creating underlying watcher`);
        watcher = createWatcher();
        await whenReady(watcher.baseWatcher);
    }

    return {
        dispose(): void {
            disposed = true;
            onFileChangeEmitter.dispose();
            watcher.close();
        },
        event: onFileChangeEmitter.event,
        refresh() {
            if (disposed) {
                warn(`${id} watcher refresh() called after dispose\n${new Error().stack}`);
                return;
            }
            if (suspendCount > 0) {
                // Watcher is intentionally closed. The resume path always recreates
                // (which picks up any updated ignore rules), so an explicit refresh
                // here would be redundant and wasteful.
                trace(
                    `${id} watcher refresh requested while suspended; will be applied by resume`,
                );
                return;
            }
            if (watcher.isClosed()) {
                trace(
                    `${id} watcher refresh requested but watcher is closed, skipping refresh\n${new Error().stack}`,
                );
                return;
            }
            watcher.close();
            watcher = createWatcher();
        },
        suspend(): SuspendHandle {
            if (disposed) {
                warn(`${id} watcher suspend() called after dispose\n${new Error().stack}`);
                // Return an inert handle so `await using` at the callsite is still well-formed.
                return { [Symbol.asyncDispose]: async () => {} };
            }
            suspendCount++;
            if (suspendCount === 1) {
                trace(`${id} watcher suspending, closing underlying watcher`);
                watcher.close();
            }
            let released = false;
            return {
                [Symbol.asyncDispose]: async () => {
                    if (released) {
                        return;
                    }
                    released = true;
                    await release();
                },
            };
        },
    };
}

function isWatchableEvent(event: TargetEvent): boolean {
    return event !== "addDir" && event !== "unlinkDir" && event !== "renameDir";
}

/** Changes made before this settles may go unreported; changes made after will not. */
function whenReady(watcher: BaseWatcher): Promise<void> {
    if (watcher.isReady() || watcher.isClosed()) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        watcher.once("ready", resolve);
        // A watcher closed during setup never becomes ready.
        watcher.once("close", resolve);
    });
}

export function createIgnoreFnFromList(ignoreList: string[]): (path: string) => boolean {
    return function ignoreFn(targetPath: string): boolean {
        if (ignoreList.some(i => targetPath === i || targetPath.startsWith(i + "/"))) {
            return true;
        }

        return false;
    };
}
