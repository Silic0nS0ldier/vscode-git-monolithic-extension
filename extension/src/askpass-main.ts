/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as i18n from "./i18n/mod.js";
import { IPCClient } from "./ipc/ipcClient.js";

function fatal(errMsg: string): void {
    console.error(i18n.Translations.missOrInvalid());
    console.error(errMsg);
    process.exit(1);
}

function main(argv: string[]): void {
    if (argv.length !== 5) {
        return fatal("Wrong number of arguments");
    }

    if (!process.env["VSCODE_GIT_ASKPASS_PIPE"]) {
        return fatal("Missing pipe");
    }

    if (process.env["VSCODE_GIT_COMMAND"] === "fetch" && !!process.env["VSCODE_GIT_FETCH_SILENT"]) {
        return fatal("Skip silent fetch commands");
    }

    const output = process.env["VSCODE_GIT_ASKPASS_PIPE"] as string;
    const request = argv[2];
    const host = argv[4].replace(/^["']+|["':]+$/g, "");
    const ipcClient = new IPCClient("askpass");

    ipcClient.call({ host, request }).then(res => {
        fs.writeFileSync(output, res + "\n");
        setTimeout(() => process.exit(0), 0);
    }).catch(err => fatal(err));
}

main(process.argv);
