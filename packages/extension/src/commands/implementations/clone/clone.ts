import TelemetryReporter from "vscode-extension-telemetry";
import { ScmCommand } from "../../helpers.js";
import { Git } from "../../../git.js";
import { Model } from "../../../model.js";
import { cloneRepository } from "./helpers.js";

export function createCommand(model: Model, telemetryReporter: TelemetryReporter, git: Git): ScmCommand {
	async function clone(url?: string, parentPath?: string): Promise<void> {
		await cloneRepository(model, telemetryReporter, git, url, parentPath);
	};

	return {
		commandId: 'git.clone',
		method: clone,
		options: {},
	};
}

