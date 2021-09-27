import { ScmCommand } from "../../commands.js";
import { Model } from "../../model.js";
import { Repository } from "../../repository.js";

export function createCommand(
	model: Model,
): ScmCommand {
	async function close(repository: Repository): Promise<void> {
		model.close(repository);
	};

	return {
		commandId: 'git.close',
		method: close,
		options: {
			repository: true,
		},
	};
}

