/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as querystring from "node:querystring";
import { commands, Disposable, type OutputChannel, Uri, type UriHandler, window } from "vscode";
import { dispose } from "./util/disposals.js";

export class GitProtocolHandler implements UriHandler {
    #disposables: Disposable[] = [];
    #outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel) {
        this.#outputChannel = outputChannel;
        this.#disposables.push(window.registerUriHandler(this));
    }

    handleUri(uri: Uri): void {
        switch (uri.path) {
            case "/clone":
                this.#clone(uri);
        }
    }

    #clone(uri: Uri): void {
        const data = querystring.parse(uri.query);

        if (!data.url) {
            this.#outputChannel.appendLine("[WARN] Failed to open URI: " + uri.toString());
        }

        commands.executeCommand("git.clone", data.url);
    }

    dispose(): void {
        this.#disposables = dispose(this.#disposables);
    }
}
