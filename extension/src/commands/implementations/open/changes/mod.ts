import type { OutputChannel } from "vscode";
import type { Model } from "../../../../model.js";
import { pruned } from "../../../pruned.js";
import * as selected from "../../../selection.gen.js";
import * as openAllChanges from "./open-all-changes.js";
import * as openChange from "./open-change.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        selected.openAllChanges ? openAllChanges.createCommand() : pruned("openAllChanges"),
        selected.openChange ? openChange.createCommand(model, outputChannel) : pruned("openChange"),
    ];
}
