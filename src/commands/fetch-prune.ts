import { window } from "vscode";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(): ScmCommand {
	async function fetchPrune(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to fetch', "This repository has no remotes configured to fetch from."));
			return;
		}

		await repository.fetchPrune();
	};

	return {
		commandId: 'git.fetchPrune',
		key: fetchPrune.name,
		method: fetchPrune,
		options: {
			repository: true,
		},
	};
}

