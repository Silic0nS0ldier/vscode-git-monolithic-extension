import { window } from "vscode";
import { ScmCommand } from "../../helpers.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export function createCommand(): ScmCommand {
	async function fetchAll(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to fetch', "This repository has no remotes configured to fetch from."));
			return;
		}

		await repository.fetchAll();
	};

	return {
		commandId: 'git.fetchAll',
		method: fetchAll,
		options: {
			repository: true,
		},
	};
}

