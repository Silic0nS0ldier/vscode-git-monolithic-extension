import { inspect } from "node:util";
import BaseWatcher from "watcher";
import { error } from "../tracing.js";
import type { WatchBackend, WatchBackendOptions } from "./backend.js";

type TargetEvent = Parameters<BaseWatcher["event"]>[0];

export function createPackageWatcher(options: WatchBackendOptions): WatchBackend {
    const watcher = new BaseWatcher(
        options.targets.map(target => target.path),
        {
            // TODO Check that file limit is not exceeded (10_000_000)
            //      Use `git ls-files | wc -l` (or similar) to check
            debounce: options.debounceMs,
            ignoreInitial: true,
            renameDetection: false,
            recursive: true,
            ignore: options.ignore,
        },
        (event, filePath, nextPath) => {
            options.onEvent({
                event,
                path: filePath,
                watchable: isWatchableEvent(event),
            });
            if (nextPath !== undefined) {
                options.onEvent({
                    event,
                    path: nextPath,
                    watchable: isWatchableEvent(event),
                });
            }
        },
    );

    watcher.on("error", failure => {
        error(`${options.id} npm:watcher watcher failed: ${inspect(failure)}`);
    });

    return {
        dispose: (): void => {
            if (!watcher.isClosed()) {
                watcher.close();
            }
        },
        ready: whenReady(watcher),
    };
}

function isWatchableEvent(event: TargetEvent): boolean {
    return event !== "addDir" && event !== "unlinkDir" && event !== "renameDir";
}

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
