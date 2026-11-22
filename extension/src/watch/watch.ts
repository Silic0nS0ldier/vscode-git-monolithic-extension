import { Disposable, type Event, EventEmitter, Uri } from "vscode";
import { trace, warn } from "../tracing.js";
import * as config from "../util/config.js";
import { UnreachableError } from "../util/unreachable-error.js";
import type { WatchBackend, WatchBackendOptions, WatchTarget } from "./backend.js";
import { createEventBatcher } from "./event-batcher.js";
import { createLockGate } from "./lock-gate.js";
import { createPackageWatcher } from "./package-watcher.js";
import { createVSCodeWatcher } from "./vscode-watcher.js";
import { createWatchmanWatcher } from "./watchman-watcher.js";

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
    targets: readonly [WatchTarget, ...WatchTarget[]],
    locks: string[],
    ignoreFn: (path: string) => boolean,
    important: string[],
    id: string,
): Watcher {
    const onFileChangeEmitter = new EventEmitter<Uri>();
    let suspendCount = 0;
    let disposed = false;
    const backend = config.watcherBackend();
    trace(`${id} watcher selecting ${backend} backend`);

    function createWatcher() {
        const lockGate = createLockGate<WatchBackendEvent>(locks, important, recalled => {
            trace(`${id} watcher releasing ${recalled.size} important events`);
            for (const [recallPath, event] of recalled) {
                trace(`${id} watcher recalled event "${event.event}" "${recallPath}"`);
                onFileChangeEmitter.fire(Uri.file(recallPath));
            }
        });
        const debounceMs = config.watcherDebounce();
        const sharedDebounceMs = backend === "vscode" || backend === "watchman" ? debounceMs : 0;
        const eventBatcher = createEventBatcher(sharedDebounceMs, event => {
            if (ignoreFn(event.path)) {
                return;
            }
            if (lockGate.handle(event, event.path, event.watchable)) {
                return;
            }
            if (event.watchable) {
                trace(`${id} watcher event "${event.event}" "${event.path}"`);
                onFileChangeEmitter.fire(Uri.file(event.path));
            }
        });
        const backendOptions: WatchBackendOptions = {
            debounceMs,
            id,
            ignore: ignoreFn,
            onEvent: event => {
                if (!ignoreFn(event.path)) {
                    eventBatcher.push(event);
                }
            },
            targets,
        };
        const rawWatcher = createBackend(backend, backendOptions);

        return {
            rawWatcher,
            close(): void {
                eventBatcher.dispose();
                lockGate.dispose();
                rawWatcher.dispose();
            },
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
        await watcher.rawWatcher.ready;
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

type WatchBackendEvent = Parameters<WatchBackendOptions["onEvent"]>[0];

function createBackend(
    backend: config.WatcherBackend,
    options: WatchBackendOptions,
): WatchBackend {
    switch (backend) {
        case "npm:watcher":
            return createPackageWatcher(options);
        case "vscode":
            return createVSCodeWatcher(options);
        case "watchman":
            return createWatchmanWatcher(options);
        default:
            throw new UnreachableError(backend);
    }
}

export function createIgnoreFnFromList(ignoreList: string[]): (path: string) => boolean {
    return function ignoreFn(targetPath: string): boolean {
        if (ignoreList.some(i => targetPath === i || targetPath.startsWith(i + "/"))) {
            return true;
        }

        return false;
    };
}
