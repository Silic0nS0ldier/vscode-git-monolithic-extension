/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, Uri } from 'vscode';
import { join } from 'node:path';
import Watcher from "watcher";
import { TargetEvent } from "watcher/dist/enums.js"
import { IDisposable } from './util.js';

export interface IFileWatcher extends IDisposable {
	readonly event: Event<Uri>;
}

/**
 * Creates an optimised watcher.
 * @param location
 * @returns
 */
export function watch(location: string): IFileWatcher {
	const onDotGitFileChangeEmitter = new EventEmitter<Uri>();
	const dotGitWatcher = new Watcher(
		location,
		{
			debounce: 500,
			renameDetection: false,
		},
		(et, path) => {
			// Filter directory events, only files are of interest
			if (et !== TargetEvent.ADD_DIR && et !== TargetEvent.UNLINK_DIR && et !== TargetEvent.RENAME_DIR) {
				onDotGitFileChangeEmitter.fire(Uri.file(path));
			}
		},
	);

	dotGitWatcher.on('change', (_, e) => onDotGitFileChangeEmitter.fire(Uri.file(join(location, e as string))));
	dotGitWatcher.on('error', err => console.error(err));

	return new class implements IFileWatcher {
		event = onDotGitFileChangeEmitter.event;
		dispose() {
			onDotGitFileChangeEmitter.dispose();
			dotGitWatcher.close();
		}
	};
}
