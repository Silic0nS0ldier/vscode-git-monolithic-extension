/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import { EventEmitter, OutputChannel, Uri } from "vscode";
import Watcher from "watcher";
import type { TargetEvent } from "watcher/dist/enums.js";
import { prettyPrint } from "../logging/pretty-print.js";

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

/**
 * Creates an optimised watcher.
 * @param location
 * @returns
 */
export function watch(locations: string[], locks: string[], outputChannel: OutputChannel) {
    const onFileChangeEmitter = new EventEmitter<Uri>();
    const watcher = new Watcher(
        [...locations, ...locks],
        {
            debounce: 500,
            ignoreInitial: true,
            renameDetection: false,
        },
        (et, path) => {
            if (locks.some(fs.existsSync)) {
                // Lock exists, don't propagate changes
                return;
            }

            // Filter directory events, only files are of interest
            // TODO Do the individual files also get updated?
            if (et !== TargetEventEnum.addDir && et !== TargetEventEnum.unlinkDir && et !== TargetEventEnum.renameDir) {
                outputChannel.appendLine(`TRACE: watcher event "${et}" "${path}"`);
                onFileChangeEmitter.fire(Uri.file(path));
            }
        },
    );

    // TODO Use unified logger
    watcher.on("error", err => outputChannel.appendLine(`Watcher error: ${prettyPrint(err)}`));

    return {
        dispose() {
            onFileChangeEmitter.dispose();
            watcher.close();
        },
        event: onFileChangeEmitter.event,
    };
}
