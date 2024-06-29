/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable, Event } from "vscode";
import type { RemoteSourceProvider } from "./api/git.js";

export interface IRemoteSourceProviderRegistry {
    readonly onDidAddRemoteSourceProvider: Event<RemoteSourceProvider>;
    readonly onDidRemoveRemoteSourceProvider: Event<RemoteSourceProvider>;
    registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable;
    getRemoteProviders(): RemoteSourceProvider[];
}
