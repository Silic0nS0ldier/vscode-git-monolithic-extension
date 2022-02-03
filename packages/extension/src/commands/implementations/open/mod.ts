import { OutputChannel } from "vscode";
import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
import * as openChanges from "./changes/mod.js";
import * as openFile from "./file/mod.js";
import * as openRepository from "./open-repository.js";
import * as openResource from "./open-resource.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
    return [
        ...openChanges.createCommands(model, outputChannel),
        ...openFile.createCommands(model, outputChannel),
        openRepository.createCommand(model),
        openResource.createCommand(model),
    ];
}
