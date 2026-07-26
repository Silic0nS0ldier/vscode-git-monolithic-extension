/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import { inspect } from "node:util";
import { Disposable, type Event, EventEmitter, type OutputChannel, Uri } from "vscode";
import BaseWatcher from "watcher";

type TargetEvent = Parameters<BaseWatcher["event"]>[0];

// This funny looking object satisfies isolated modules rules regarding ambient const enum usage
// while remaining type checked _just enough_ that if something changes in an update, we'll know.
const TargetEventEnum: Record<TargetEvent, string> = {
    add: "add",
    addDir: "addDir",
    change: "change",
    rename: "rename",
    renameDir: "renameDir",
    unlink: "unlink",
    unlinkDir: "unlinkDir",
};

type Watcher = {
    event: Event<Uri>;
    refresh: () => void;
    suspend: () => SuspendHandle;
} & Disposable;

/** Handle returned by `Watcher.suspend()`; on dispose the suspend is released. */
export type SuspendHandle = {
    readonly [Symbol.dispose]: () => void;
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
    outputChannel: OutputChannel,
    id: string,
): Watcher {
    const onFileChangeEmitter = new EventEmitter<Uri>();
    let suspendCount = 0;
    let disposed = false;

    function createWatcher() {
        const lockEvents = new Map<string, keyof typeof TargetEventEnum>();
        const watcher = new BaseWatcher(
            [...locations, ...locks],
            {
                // TODO Check that file limit is not exceeded (10_000_000)
                //      Use `git ls-files | wc -l` (or similar) to check
                debounce: 500,
                ignoreInitial: true,
                renameDetection: false,
                recursive: true,
                ignore: ignoreFn,
            },
            (et, path) => {
                if (locks.some(fs.existsSync)) {
                    // Lock exists, don't propagate changes
                    if (lockEvents.size === 0 && isWatchableEvent(et)) {
                        lockEvents.set(path, et);
                    } else if (important.includes(path) && isWatchableEvent(et)) {
                        // Important file changed while lock present, remember it
                        lockEvents.set(path, et);
                    }
                    return;
                }
    
                if (lockEvents.size > 0) {
                    // Locks gone, fire remembered events
                    outputChannel.appendLine(`TRACE: ${id} watcher releasing ${lockEvents.size} important events`);
                    for (const [recallPath, recallEt] of lockEvents) {
                        outputChannel.appendLine(`TRACE: ${id} watcher recalled event "${recallEt}" "${recallPath}"`);
                        onFileChangeEmitter.fire(Uri.file(recallPath));
                    }
                    lockEvents.clear();
                }
    
                // Filter directory events, only files are of interest
                // TODO Do the individual files also get updated?
                if (isWatchableEvent(et)) {
                    outputChannel.appendLine(`TRACE: ${id} watcher event "${et}" "${path}"`);
                    onFileChangeEmitter.fire(Uri.file(path));
                }
            },
        );
    
        // TODO Use unified logger
        watcher.on("error", err => {
            outputChannel.appendLine(`${id} watcher error: ${inspect(err)}`);
        });

        return watcher;
    }

    let watcher = createWatcher();

    function release(): void {
        if (disposed) {
            outputChannel.appendLine(`WARN: ${id} watcher suspend handle disposed after watcher was disposed\n${new Error().stack}`);
            return;
        }
        if (suspendCount === 0) {
            outputChannel.appendLine(`WARN: ${id} watcher suspend handle disposed with no active suspend\n${new Error().stack}`);
            return;
        }
        suspendCount--;
        if (suspendCount > 0) {
            return;
        }

        outputChannel.appendLine(`TRACE: ${id} watcher resuming, re-creating underlying watcher`);
        watcher = createWatcher();
        // Fire a single synthetic event so consumers refresh their view.
        onFileChangeEmitter.fire(Uri.file(locations[0]));
    }

    return {
        dispose(): void {
            disposed = true;
            onFileChangeEmitter.dispose();
            if (!watcher.isClosed()) {
                watcher.close();
            }
        },
        event: onFileChangeEmitter.event,
        refresh() {
            if (disposed) {
                outputChannel.appendLine(`WARN: ${id} watcher refresh() called after dispose\n${new Error().stack}`);
                return;
            }
            if (suspendCount > 0) {
                // Watcher is intentionally closed. The resume path always recreates
                // (which picks up any updated ignore rules), so an explicit refresh
                // here would be redundant and wasteful.
                outputChannel.appendLine(`TRACE: ${id} watcher refresh requested while suspended; will be applied by resume`);
                return;
            }
            if (watcher.isClosed()) {
                outputChannel.appendLine(`TRACE: ${id} watcher refresh requested but watcher is closed, skipping refresh\n${new Error().stack}`);
                return;
            }
            watcher.close();
            watcher = createWatcher();
        },
        suspend(): SuspendHandle {
            if (disposed) {
                outputChannel.appendLine(`WARN: ${id} watcher suspend() called after dispose\n${new Error().stack}`);
                // Return an inert handle so `using` at the callsite is still well-formed.
                return { [Symbol.dispose]: () => {} };
            }
            suspendCount++;
            if (suspendCount === 1) {
                outputChannel.appendLine(`TRACE: ${id} watcher suspending, closing underlying watcher`);
                if (!watcher.isClosed()) {
                    watcher.close();
                }
            }
            let released = false;
            return {
                [Symbol.dispose]: () => {
                    if (released) {
                        return;
                    }
                    released = true;
                    release();
                },
            };
        },
    };
}

function isWatchableEvent(event: keyof typeof TargetEventEnum): boolean {
    return event !== TargetEventEnum.addDir && event !== TargetEventEnum.unlinkDir && event !== TargetEventEnum.renameDir
}

export function createIgnoreFnFromList(ignoreList: string[]): (path: string) => boolean {
    return function ignoreFn(targetPath: string): boolean {
        if (ignoreList.some(i => targetPath === i || targetPath.startsWith(i + '/'))) {
            return true;
        }

        return false;
    };
}
