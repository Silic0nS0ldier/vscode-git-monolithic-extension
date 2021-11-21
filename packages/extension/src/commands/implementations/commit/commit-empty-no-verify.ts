import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitEmptyNoVerify(repository: Repository): Promise<void> {
		await commitEmpty(repository, model, true);
	};

	return {
		commandId: 'git.commitEmptyNoVerify',
		method: commitEmptyNoVerify,
		options: {
			repository: true,
		},
	};
}

