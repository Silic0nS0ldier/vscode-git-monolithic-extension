import { window } from "vscode";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export async function stashPopLatest(repository: Repository): Promise<void>  {
	const stashes = await repository.getStashes();

	if (stashes.length === 0) {
		window.showInformationMessage(localize('no stashes', "There are no stashes in the repository."));
		return;
	}

	await repository.popStash();
}

export function createCommand(): ScmCommand {
	return {
		commandId: 'git.stashPopLatest',
		method: stashPopLatest,
		options: {
			repository: true,
		},
	};
}

