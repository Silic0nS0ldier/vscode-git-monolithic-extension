import TelemetryReporter from "vscode-extension-telemetry";
import { Git } from "../../../git.js";
import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
import * as cloneRecursive from "./clone-recursive.js";
import * as clone from "./clone.js";

export function createCommands(model: Model, telemetryReporter: TelemetryReporter, git: Git): ScmCommand[] {
	return [
		clone.createCommand(model, telemetryReporter, git),
		cloneRecursive.createCommand(model, telemetryReporter, git),
	]
}
