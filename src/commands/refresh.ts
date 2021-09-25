import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(): ScmCommand {
	async function refresh(repository: Repository): Promise<void> {
		await repository.status();
	};

	return {
		commandId: 'git.refresh',
		key: refresh.name,
		method: refresh,
		options: {
			repository: true,
		},
	};
}

