import * as http from "node:http";
import { json } from "node:stream/consumers";

export class IPCClient {
    #ipcHandlePath: string;
    #handlerName: string;
    constructor(handlerName: string) {
        this.#handlerName = handlerName;
        const ipcHandlePath = process.env["VSCODE_GIT_IPC_HANDLE"];

        if (!ipcHandlePath) {
            throw new Error("Missing VSCODE_GIT_IPC_HANDLE");
        }

        this.#ipcHandlePath = ipcHandlePath;
    }

    call(request: any): Promise<any> {
        const opts: http.RequestOptions = {
            method: "POST",
            path: `/${this.#handlerName}`,
            socketPath: this.#ipcHandlePath,
        };

        return new Promise((c, e) => {
            const req = http.request(opts, res => {
                if (res.statusCode !== 200) {
                    return e(new Error(`Bad status code: ${res.statusCode}`));
                }

                json(res).then(c, e);
            });

            req.on("error", err => e(err));
            req.write(JSON.stringify(request));
            req.end();
        });
    }
}
