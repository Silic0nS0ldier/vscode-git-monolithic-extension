import { SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../../../../commands.js";
import { Resource } from "../../../../repository.js";
import { openFile } from "./open-file.js";

// TODO Merge with `openFile`, since they are identical
export function createCommand(getSCMResource: (uri?: Uri) => Resource | undefined): ScmCommand {
	async function openFile2(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		await openFile(getSCMResource, arg, ...resourceStates);
	};

	return {
		commandId: 'git.openFile2',
		method: openFile2,
		options: {},
	};
}

