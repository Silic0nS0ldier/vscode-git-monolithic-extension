import { window } from "vscode";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(): ScmCommand {
	async function fetch(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to fetch', "This repository has no remotes configured to fetch from."));
			return;
		}

		await repository.fetchDefault();
	};

	return {
		commandId: 'git.fetch',
		key: fetch.name,
		method: fetch,
		options: {
			repository: true,
		},
	};
}

