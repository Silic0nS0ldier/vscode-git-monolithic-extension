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

    private _onDidChangeEnablement = new EventEmitter<boolean>();
    readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

    private _model: Model | undefined = undefined;

    set model(model: Model | undefined) {
        this._model = model;

        const enabled = !!model;

        if (this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        this._onDidChangeEnablement.fire(this.enabled);
    }

    get model(): Model | undefined {
        return this._model;
    }

    constructor(model?: Model) {
        if (model) {
            this.enabled = true;
            this._model = model;
        }
    }

    getAPI(version: number): API {
        if (!this._model) {
            throw new Error("Git model not found");
        }

        if (version !== 1) {
            throw new Error(`No API version ${version} found.`);
        }

        return new ApiImpl(this._model);
    }
}
