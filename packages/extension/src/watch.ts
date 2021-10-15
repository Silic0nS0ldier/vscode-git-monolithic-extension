/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, Uri } from "vscode";
import Watcher from "watcher";
import { TargetEvent } from "watcher/dist/enums.js"
import { IDisposable } from "./util.js";

export interface IFileWatcher extends IDisposable {
	readonly event: Event<Uri>;
}

/**
 * Creates an optimised watcher.
 * @param location
 * @returns
 */
export function watch(locations: string[]): IFileWatcher {
	const onDotGitFileChangeEmitter = new EventEmitter<Uri>();
	const dotGitWatcher = new Watcher(
		locations,
		{
			debounce: 500,
			renameDetection: false,
		},
		(et, path) => {
			// TODO Ignore if index.lock present
			// Filter directory events, only files are of interest
			if (et !== TargetEvent.ADD_DIR && et !== TargetEvent.UNLINK_DIR && et !== TargetEvent.RENAME_DIR) {
				onDotGitFileChangeEmitter.fire(Uri.file(path));
			}
		},
	);

	// TODO Use unified logger
	dotGitWatcher.on('error', err => console.error(err));

	return new class implements IFileWatcher {
		event = onDotGitFileChangeEmitter.event;
		dispose() {
			onDotGitFileChangeEmitter.dispose();
			dotGitWatcher.close();
		}
	};
}
