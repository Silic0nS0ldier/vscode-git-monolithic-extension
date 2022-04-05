/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter } from "vscode";
import type { Model } from "../model.js";
import { ApiImpl } from "./api1.js";
import type { API, GitExtension } from "./git.js";

export class GitExtensionImpl implements GitExtension {
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

    constructor(model?: Model) {
        if (model) {
            this.enabled = true;
            this.#model = model;
        }
    }

    getAPI(version: number): API {
        if (!this.#model) {
            throw new Error("Git model not found");
        }

        if (version !== 1) {
            throw new Error(`No API version ${version} found.`);
        }

        return new ApiImpl(this.#model);
    }
}
