import type { OutputChannel } from "vscode";
import type { Model } from "../../../../model.js";
import * as openAllChanges from "./open-all-changes.js";
import * as openChange from "./open-change.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        openAllChanges.createCommand(),
        openChange.createCommand(model, outputChannel),
    ];
}
