import type { OutputChannel } from "vscode";
import type { Model } from "../../../../model.js";
import { pruned } from "../../../pruned.js";
import * as selected from "../../../selection.gen.js";
import * as openFile2 from "./open-file-2.js";
import * as openFile from "./open-file.js";
import * as openHeadFile from "./open-head-file.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        selected.openFile ? openFile.createCommand(model, outputChannel) : pruned("openFile"),
        selected.openFile2 ? openFile2.createCommand(model, outputChannel) : pruned("openFile2"),
        selected.openHEADFile ? openHeadFile.createCommand(model, outputChannel) : pruned("openHEADFile"),
    ];
}
