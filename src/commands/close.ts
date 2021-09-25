import { ScmCommand } from "../commands.js";
import { Model } from "../model.js";
import { Repository } from "../repository.js";

export function createCommand(
	model: Model,
): ScmCommand {
	async function close(repository: Repository): Promise<void> {
		model.close(repository);
	};

	return {
		commandId: 'git.close',
		key: close.name,
		method: close,
		options: {
			repository: true,
		},
	};
}

