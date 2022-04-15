/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ExtensionContext, workspace } from "vscode";
import { filterEvent } from "./util/events.js";

// TODO Review function name
export function registerTerminalEnvironmentManager(
    context: ExtensionContext,
    env: { [key: string]: string },
): Disposable {
    let enabled = false;

    function refresh() {
        const config = workspace.getConfiguration("git", null);
        const newEnabled = config.get<boolean>("enabled", true) && config.get("terminalAuthentication", true);

        if (newEnabled === enabled) {
            return;
        }

        enabled = newEnabled;
        context.environmentVariableCollection.clear();

        if (enabled) {
            for (const name of Object.keys(env)) {
                context.environmentVariableCollection.replace(name, env[name]);
            }
        }
    }

    return filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration("git"))(refresh);
}
