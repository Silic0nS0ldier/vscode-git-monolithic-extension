import { OutputChannel, window } from "vscode";
import { Log, LogLevel } from "../../logging/log.js";
import { localize } from "../../util.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(
    outputChannel: OutputChannel,
): ScmCommand {
    async function setLogLevel(): Promise<void> {
        const createItem = (logLevel: LogLevel) => ({
            description: Log.logLevel === logLevel ? localize("current", "Current") : undefined,
            label: LogLevel[logLevel],
            logLevel,
        });

        const items = [
            createItem(LogLevel.Trace),
            createItem(LogLevel.Debug),
            createItem(LogLevel.Info),
            createItem(LogLevel.Warning),
            createItem(LogLevel.Error),
            createItem(LogLevel.Critical),
            createItem(LogLevel.Off),
        ];

        const choice = await window.showQuickPick(items, {
            placeHolder: localize("select log level", "Select log level"),
        });

        if (!choice) {
            return;
        }

        Log.logLevel = choice.logLevel;
        outputChannel.appendLine(localize("changed", "Log level changed to: {0}", LogLevel[Log.logLevel]));
    }

    return {
        commandId: "git.setLogLevel",
        method: setLogLevel,
        options: {},
    };
}
