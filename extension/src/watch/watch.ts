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
} & Disposable;

/**
 * Creates an optimised watcher that signals _something_ changed in the given locations.
 * Excess events (such as those occurring while locks are present) are suppressed.
 */
export function watch(
    locations: string[],
    locks: string[],
    ignoreFn: (path: string) => boolean,
    important: string[],
    outputChannel: OutputChannel,
    id: string,
): Watcher {
    const onFileChangeEmitter = new EventEmitter<Uri>();

    function createWatcher() {
        const lockEvents = new Map<string, keyof typeof TargetEventEnum>();
        let watcher = new BaseWatcher(
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
        watcher.on("error", async err => {
            outputChannel.appendLine(`${id} watcher error: ${inspect(err)}`);
        });

        return watcher;
    }

    let watcher = createWatcher();


    return {
        dispose(): void {
            onFileChangeEmitter.dispose();
            watcher.close();
        },
        event: onFileChangeEmitter.event,
        refresh() {
            if (watcher.isClosed()) {
                outputChannel.appendLine(`TRACE: ${id} watcher refresh requested but watcher is closed, skipping refresh\n${new Error().stack}`);
                return;
            }
            watcher.close();
            watcher = createWatcher();
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
