import { OutputChannel } from "vscode";
import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
import * as unstageAll from "./unstage-all.js";
// import * as unstageSelectedRanges from "./unstage-seleted-ranges.js";
import * as unstage from "./unstage.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
    return [
        unstage.createCommand(outputChannel, model),
        unstageAll.createCommand(),
    ];
}
