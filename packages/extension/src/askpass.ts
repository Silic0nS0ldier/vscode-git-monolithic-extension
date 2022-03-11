/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Disposable, InputBoxOptions, OutputChannel, Uri, window, workspace } from "vscode";
import type { Credentials, CredentialsProvider } from "./api/git.js";
import { createIPCServer, IIPCHandler, IIPCServer } from "./ipc/ipcServer.js";
import { EmptyDisposable, IDisposable, toDisposable } from "./util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Askpass implements IIPCHandler {
    private disposable: IDisposable = EmptyDisposable;
    private cache = new Map<string, Credentials>();
    private credentialsProviders = new Set<CredentialsProvider>();

    static async create(outputChannel: OutputChannel, context?: string): Promise<Askpass> {
        try {
            return new Askpass(await createIPCServer(context));
        } catch (err) {
            outputChannel.appendLine(`[error] Failed to create git askpass IPC: ${err}`);
            return new Askpass();
        }
    }

    private constructor(private ipc?: IIPCServer) {
        if (ipc) {
            this.disposable = ipc.registerHandler("askpass", this);
        }
    }

    async handle({ request, host }: { request: string; host: string }): Promise<string> {
        const config = workspace.getConfiguration("git", null);
        const enabled = config.get<boolean>("enabled");

        if (!enabled) {
            return "";
        }

        const uri = Uri.parse(host);
        const authority = uri.authority.replace(/^.*@/, "");
        const password = /password/i.test(request);
        const cached = this.cache.get(authority);

        if (cached && password) {
            this.cache.delete(authority);
            return cached.password;
        }

        if (!password) {
            for (const credentialsProvider of this.credentialsProviders) {
                try {
                    const credentials = await credentialsProvider.getCredentials(uri);

                    if (credentials) {
                        this.cache.set(authority, credentials);
                        setTimeout(() => this.cache.delete(authority), 60_000);
                        return credentials.username;
                    }
                } catch {}
            }
        }

        const options: InputBoxOptions = {
            ignoreFocusOut: true,
            password,
            placeHolder: request,
            prompt: `Git: ${host}`,
        };

        return await window.showInputBox(options) || "";
    }

    getEnv(): { [key: string]: string } {
        if (!this.ipc) {
            return {
                GIT_ASKPASS: path.join(__dirname, "askpass-empty.sh"),
            };
        }

        return {
            ...this.ipc.getEnv(),
            GIT_ASKPASS: path.join(__dirname, "askpass.sh"),
            VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, "askpass-main.js"),
            VSCODE_GIT_ASKPASS_NODE: process.execPath,
        };
    }

    registerCredentialsProvider(provider: CredentialsProvider): Disposable {
        this.credentialsProviders.add(provider);
        return toDisposable(() => this.credentialsProviders.delete(provider));
    }

    dispose(): void {
        this.disposable.dispose();
    }
}
