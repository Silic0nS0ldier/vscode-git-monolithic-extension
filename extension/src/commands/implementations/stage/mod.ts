import type { OutputChannel } from "vscode";
import type { Model } from "../../../model.js";
import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as stageAllMerge from "./stage-all-merge.js";
import * as stageAllTracked from "./stage-all-tracked.js";
import * as stageAllUntracked from "./stage-all-untracked.js";
import * as stageAll from "./stage-all.js";
import * as stageSelectedRanges from "./stage-selected-ranges.js";
import * as stage from "./stage.js";

export function createCommands(model: Model, outputChannel: OutputChannel) {
    return [
        selected.stage ? stage.createCommand(outputChannel, model) : pruned("stage"),
        selected.stageAll ? stageAll.createCommand() : pruned("stageAll"),
        selected.stageAllMerge ? stageAllMerge.createCommand() : pruned("stageAllMerge"),
        selected.stageAllTracked ? stageAllTracked.createCommand() : pruned("stageAllTracked"),
        selected.stageAllUntracked ? stageAllUntracked.createCommand() : pruned("stageAllUntracked"),
        selected.stageSelectedRanges
            ? stageSelectedRanges.createCommand(model, outputChannel)
            : pruned("stageSelectedRanges"),
    ];
}
