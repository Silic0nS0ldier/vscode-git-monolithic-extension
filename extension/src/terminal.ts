import { Disposable, type ExtensionContext, workspace } from "vscode";
import * as config from "./util/config.js";
import { filterEvent } from "./util/events.js";

// TODO Review function name
export function registerTerminalEnvironmentManager(
    context: ExtensionContext,
    env: { [key: string]: string },
): Disposable {
    let enabled = false;

    function refresh(): void {
        const newEnabled = config.enabled() && config.terminalAuthentication();

        if (newEnabled === enabled) {
            return;
        }

        enabled = newEnabled;
        context.environmentVariableCollection.clear();

        if (enabled) {
            for (const name in env) {
                const value = env[name];
                if (value) {
                    context.environmentVariableCollection.replace(name, value);
                }
            }
        }
    }

    return filterEvent(workspace.onDidChangeConfiguration, e => config.affected(e))(refresh);
}
