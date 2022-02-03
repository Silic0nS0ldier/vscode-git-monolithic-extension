import { OutputChannel } from "vscode";
import { Model } from "../../../../model.js";
import { ScmCommand } from "../../../helpers.js";
import * as openAllChanges from "./open-all-changes.js";
import * as openChange from "./open-change.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
    return [
        openAllChanges.createCommand(),
        openChange.createCommand(model, outputChannel),
    ];
}
