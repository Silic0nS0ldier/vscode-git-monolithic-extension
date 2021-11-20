import { SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../../../../commands.js";
import { Resource } from "../../../../repository.js";

// TODO Merge with `openFile`, since they are identical
export function createCommand(
	openFile: (arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]) => Promise<void>,
): ScmCommand {
	async function openFile2(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		await openFile(arg, ...resourceStates);
	};

	return {
		commandId: 'git.openFile2',
		method: openFile2,
		options: {},
	};
}

