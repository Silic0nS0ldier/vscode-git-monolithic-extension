import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type InputBoxOptions, type OutputChannel, window } from "vscode";
import { createIPCServer, type IIPCHandler, type IIPCServer } from "./ipc/ipcServer.js";
import * as config from "./util/config.js";
import { EmptyDisposable, type IDisposable } from "./util/disposals.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Askpass implements IIPCHandler {
    #disposable: IDisposable = EmptyDisposable;
    #ipc?: IIPCServer;

    static async create(outputChannel: OutputChannel): Promise<Askpass> {
        try {
            return new Askpass(await createIPCServer());
        } catch (err) {
            outputChannel.appendLine(`[error] Failed to create git askpass IPC: ${err}`);
            return new Askpass();
        }
    }

    private constructor(ipc?: IIPCServer) {
        this.#ipc = ipc;
        if (this.#ipc) {
            this.#disposable = this.#ipc.registerHandler("askpass", this);
        }
    }

    async handle(payload: unknown): Promise<string> {
        if (
            typeof payload !== "object" || payload === null
            || !("request" in payload) || typeof payload.request !== "string"
            || !("host" in payload) || typeof payload.host !== "string"
        ) {
            throw new Error("Invalid askpass request");
        }
        const { request, host } = payload;

        const enabled = config.enabled();

        if (!enabled) {
            return "";
        }

        const password = /password/i.test(request);
        const options: InputBoxOptions = {
            ignoreFocusOut: true,
            password,
            placeHolder: request,
            prompt: `Git: ${host}`,
        };

        return await window.showInputBox(options) || "";
    }

    getEnv(): { [key: string]: string } {
        if (!this.#ipc) {
            return {
                GIT_ASKPASS: path.join(__dirname, "askpass-empty.sh"),
            };
        }

        return {
            ...this.#ipc.getEnv(),
            GIT_ASKPASS: path.join(__dirname, "askpass.sh"),
            VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, "askpass-main.js"),
            VSCODE_GIT_ASKPASS_NODE: process.execPath,
        };
    }

    dispose(): void {
        this.#disposable.dispose();
    }
}
