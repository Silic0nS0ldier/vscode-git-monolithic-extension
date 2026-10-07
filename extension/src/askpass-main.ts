import * as fs from "node:fs";
import { missOrInvalid } from "./i18n/strings.js";
import { IPCClient } from "./ipc/ipcClient.js";

function fatal(errMsg: string): void {
    console.error(missOrInvalid());
    console.error(errMsg);
    process.exit(1);
}

function main(argv: string[]): void {
    const [, , request, , rawHost, ...extra] = argv;
    if (request === undefined || rawHost === undefined || extra.length > 0) {
        return fatal("Wrong number of arguments");
    }

    const output = process.env["VSCODE_GIT_ASKPASS_PIPE"];
    if (!output) {
        return fatal("Missing pipe");
    }

    if (process.env["VSCODE_GIT_COMMAND"] === "fetch" && !!process.env["VSCODE_GIT_FETCH_SILENT"]) {
        return fatal("Skip silent fetch commands");
    }

    const host = rawHost.replace(/^["']+|["':]+$/g, "");
    const ipcClient = new IPCClient("askpass");

    ipcClient.call({ host, request }).then(res => {
        fs.writeFileSync(output, res + "\n");
        setTimeout(() => process.exit(0), 0);
    }).catch(err => fatal(err));
}

main(process.argv);
