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
} & Disposable;

/**
 * Creates an optimised watcher.
 * @param location
 * @returns
 */
export function watch(locations: string[], locks: string[], ignores: string[], outputChannel: OutputChannel, id: string): Watcher {
    const onFileChangeEmitter = new EventEmitter<Uri>();
    const watcher = new BaseWatcher(
        [...locations, ...locks],
        {
            // TODO Check that file limit is not exceeded (10_000_000)
            //      Use `git ls-files | wc -l` (or similar) to check
            debounce: 500,
            ignoreInitial: true,
            renameDetection: false,
            recursive: true,
            ignore(targetPath) {
                if (ignores.some(i => targetPath === i || targetPath.startsWith(i + '/'))) {
                    return true;
                }

                return false;
            },
        },
        (et, path) => {
            if (locks.some(fs.existsSync)) {
                // Lock exists, don't propagate changes
                return;
            }

            // Filter directory events, only files are of interest
            // TODO Do the individual files also get updated?
            if (et !== TargetEventEnum.addDir && et !== TargetEventEnum.unlinkDir && et !== TargetEventEnum.renameDir) {
                outputChannel.appendLine(`TRACE: ${id} watcher event "${et}" "${path}"`);
                onFileChangeEmitter.fire(Uri.file(path));
            }
        },
    );

    // TODO Use unified logger
    watcher.on("error", async err => {
        outputChannel.appendLine(`${id} watcher error: ${inspect(err)}`);
    });

    return {
        dispose(): void {
            onFileChangeEmitter.dispose();
            watcher.close();
        },
        event: onFileChangeEmitter.event,
    };
}
