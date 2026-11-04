import * as querystring from "node:querystring";
import { commands, Disposable, Uri, type UriHandler, window } from "vscode";
import { makeCommandId } from "./commands/helpers.js";
import { warn } from "./tracing.js";
import { dispose } from "./util/disposals.js";

export class GitProtocolHandler implements UriHandler {
    #disposables: Disposable[] = [];

    constructor() {
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
            warn("Failed to open URI: " + uri.toString());
        }

        commands.executeCommand(makeCommandId("clone"), data.url);
    }

    dispose(): void {
        this.#disposables = dispose(this.#disposables);
    }
}
