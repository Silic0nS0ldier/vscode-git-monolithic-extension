import type { OutputChannel } from "vscode";
import type { Model } from "../../../model.js";
import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as cleanAllTracked from "./clean-all-tracked.js";
import * as cleanAllUntracked from "./clean-all-untracked.js";
import * as cleanAll from "./clean-all.js";
import * as clean from "./clean.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        selected.clean ? clean.createCommand(model, outputChannel) : pruned("clean"),
        selected.cleanAll ? cleanAll.createCommand() : pruned("cleanAll"),
        selected.cleanAllTracked ? cleanAllTracked.createCommand() : pruned("cleanAllTracked"),
        selected.cleanAllUntracked ? cleanAllUntracked.createCommand() : pruned("cleanAllUntracked"),
    ];
}
