/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Event, EventEmitter } from "vscode";
import type { Model } from "../model.js";

export class GitExtensionImpl {
    enabled: boolean = false;

    #onDidChangeEnablementEmitter = new EventEmitter<boolean>();
    readonly onDidChangeEnablement: Event<boolean> = this.#onDidChangeEnablementEmitter.event;

    #model: Model | undefined = undefined;

    set model(model: Model | undefined) {
        this.#model = model;

        const enabled = !!model;

        if (this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        this.#onDidChangeEnablementEmitter.fire(this.enabled);
    }

    get model(): Model | undefined {
        return this.#model;
    }
}
