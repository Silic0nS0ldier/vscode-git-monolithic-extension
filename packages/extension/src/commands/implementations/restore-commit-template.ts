import { ScmCommand } from "../helpers.js";
import { Repository } from "../../repository.js";

export function createCommand(): ScmCommand {
	async function restoreCommitTemplate(repository: Repository): Promise<void> {
		repository.inputBox.value = await repository.getCommitTemplate();
	};

	return {
		commandId: 'git.restoreCommitTemplate',
		method: restoreCommitTemplate,
		options: {
			repository: true,
		},
	};
}

