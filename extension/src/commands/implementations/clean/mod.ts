import type { OutputChannel } from "vscode";
import type { Model } from "../../../model.js";
import type { ScmCommand } from "../../helpers.js";
import * as cleanAllTracked from "./clean-all-tracked.js";
import * as cleanAllUntracked from "./clean-all-untracked.js";
import * as cleanAll from "./clean-all.js";
import * as clean from "./clean.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
    return [
        clean.createCommand(model, outputChannel),
        cleanAll.createCommand(),
        cleanAllTracked.createCommand(),
        cleanAllUntracked.createCommand(),
    ];
}
