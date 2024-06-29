import type { OutputChannel } from "vscode";
import type { Model } from "../../../../model.js";
import type { ScmCommand } from "../../../helpers.js";
import * as openFile2 from "./open-file-2.js";
import * as openFile from "./open-file.js";
import * as openHeadFile from "./open-head-file.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
    return [
        openFile.createCommand(model, outputChannel),
        openFile2.createCommand(model, outputChannel),
        openHeadFile.createCommand(model, outputChannel),
    ];
}
