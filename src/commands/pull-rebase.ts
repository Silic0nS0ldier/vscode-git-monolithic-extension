import { window } from "vscode";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(): ScmCommand {
	async function pullRebase(repository: Repository): Promise<void> {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		await repository.pullWithRebase(repository.HEAD);
	};

	return {
		commandId: 'git.pullRebase',
		method: pullRebase,
		options: {
			repository: true,
		},
	};
}

