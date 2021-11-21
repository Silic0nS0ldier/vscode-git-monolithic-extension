import { OutputChannel } from "vscode";
import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
import * as stageAllMerge from "./stage-all-merge.js";
import * as stageAllTracked from "./stage-all-tracked.js";
import * as stageAllUntracked from "./stage-all-untracked.js";
import * as stageAll from "./stage-all.js";
// import * as stageChange from "./stage-change.js";
// import * as stageSelectedRanges from "./stage-selected-ranges.js";
import * as stage from "./stage.js";

export function createCommands(model: Model, outputChannel: OutputChannel): ScmCommand[] {
	return [
		stage.createCommand(outputChannel, model),
		stageAll.createCommand(),
		stageAllMerge.createCommand(),
		stageAllTracked.createCommand(),
		stageAllUntracked.createCommand(),
	]
}
