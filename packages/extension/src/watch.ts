/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, OutputChannel, Uri } from "vscode";
import Watcher from "watcher";
import { TargetEvent } from "watcher/dist/enums.js"
import * as fs from 'node:fs';

/**
 * Creates an optimised watcher.
 * @param location
 * @returns
 */
export function watch(locations: string[], locks: string[], outputChannel: OutputChannel) {
	const onDotGitFileChangeEmitter = new EventEmitter<Uri>();
	const dotGitWatcher = new Watcher(
		[...locations, ...locks],
		{
			debounce: 500,
			renameDetection: false,
			ignoreInitial: true,
		},
		(et, path) => {
			if (locks.some(fs.existsSync)) {
				// Lock exists, don't propagate changes
				return;
			}

			// Filter directory events, only files are of interest
			if (et !== TargetEvent.ADD_DIR && et !== TargetEvent.UNLINK_DIR && et !== TargetEvent.RENAME_DIR) {
				outputChannel.appendLine(`TRACE: watcher event "${et}" "${path}"`);
				onDotGitFileChangeEmitter.fire(Uri.file(path));
			}
		},
	);

	// TODO Use unified logger
	dotGitWatcher.on('error', err => console.error(err));

	return {
		event: onDotGitFileChangeEmitter.event,
		dispose() {
			onDotGitFileChangeEmitter.dispose();
			dotGitWatcher.close();
		},
	};
}
