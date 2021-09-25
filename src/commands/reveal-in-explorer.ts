import { commands, SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../commands.js";

export function createCommand(): ScmCommand {
	async function revealInExplorer(resourceState: SourceControlResourceState): Promise<void> {
		if (!resourceState) {
			return;
		}

		if (!(resourceState.resourceUri instanceof Uri)) {
			return;
		}

		await commands.executeCommand('revealInExplorer', resourceState.resourceUri);
	};

	return {
		commandId: 'git.revealInExplorer',
		method: revealInExplorer,
		options: {},
	};
}

