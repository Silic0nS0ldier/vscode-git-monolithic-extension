import type { OutputChannel } from "vscode";
import type { Model } from "../../../model.js";
import * as unstageAll from "./unstage-all.js";
import * as unstage from "./unstage.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        unstage.createCommand(outputChannel, model),
        unstageAll.createCommand(),
    ];
}
