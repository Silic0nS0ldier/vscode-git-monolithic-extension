/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { PushErrorHandler } from './api/git.js';

export interface IPushErrorHandlerRegistry {
	registerPushErrorHandler(provider: PushErrorHandler): Disposable;
	getPushErrorHandlers(): PushErrorHandler[];
}
