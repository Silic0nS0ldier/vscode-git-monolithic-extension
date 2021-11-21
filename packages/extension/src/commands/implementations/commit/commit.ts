import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commit(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model);
	};

	return {
		commandId: 'git.commit',
		method: commit,
		options: {
			repository: true,
		},
	};
}

