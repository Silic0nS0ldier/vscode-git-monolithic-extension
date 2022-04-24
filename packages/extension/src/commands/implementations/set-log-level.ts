import { OutputChannel, QuickPickItem, window } from "vscode";
import { Log, LogLevel, LogLevelOptions } from "../../logging/log.js";
import * as i18n from "../../i18n/mod.js";
import type { ScmCommand } from "../helpers.js";

type LogLevelQuickPickOption = {
    logLevel: LogLevelOptions;
} & QuickPickItem;

export function createCommand(
    outputChannel: OutputChannel,
): ScmCommand {
    async function setLogLevel(): Promise<void> {
        const createItem = (logLevel: LogLevelOptions): LogLevelQuickPickOption => ({
            description: Log.logLevel === logLevel ? i18n.Translations.current() : undefined,
            label: LogLevel[logLevel],
            logLevel,
        });

        const items: LogLevelQuickPickOption[] = [
            createItem(LogLevel.Trace),
            createItem(LogLevel.Debug),
            createItem(LogLevel.Info),
            createItem(LogLevel.Warning),
            createItem(LogLevel.Error),
            createItem(LogLevel.Critical),
            createItem(LogLevel.Off),
        ];

        const choice = await window.showQuickPick(items, {
            placeHolder: i18n.Translations.selectLogLevel(),
        });

        if (!choice) {
            return;
        }

        Log.logLevel = choice.logLevel;
        outputChannel.appendLine(i18n.Translations.logLevelChanged(Log.logLevel));
    }

    return {
        commandId: "git.setLogLevel",
        method: setLogLevel,
        options: {},
    };
}
