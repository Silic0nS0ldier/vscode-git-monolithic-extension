import { window } from "vscode";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export function createCommand(): ScmCommand {
	async function rebaseAbort(repository: Repository): Promise<void> {
		if (repository.rebaseCommit) {
			await repository.rebaseAbort();
		} else {
			await window.showInformationMessage(localize('no rebase', "No rebase in progress."));
		}
	};

	return {
		commandId: 'git.rebaseAbort',
		method: rebaseAbort,
		options: {
			repository: true,
		},
	};
}

