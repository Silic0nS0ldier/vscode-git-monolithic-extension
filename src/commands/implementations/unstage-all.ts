import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(): ScmCommand {
	async function unstageAll(repository: Repository): Promise<void> {
		await repository.revert([]);
	};

	return {
		commandId: 'git.unstageAll',
		method: unstageAll,
		options: {
			repository: true,
		},
	};
}

