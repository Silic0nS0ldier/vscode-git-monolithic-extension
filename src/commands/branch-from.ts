import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	branchFn: (repository: Repository, defaultName?: string, from?: boolean) => Promise<void>,
): ScmCommand {
	async function branchFrom(repository: Repository): Promise<void> {
		await branchFn(repository, undefined, true);
	};

	return {
		commandId: 'git.branchFrom',
		key: branchFrom.name,
		method: branchFrom,
		options: {
			repository: true,
		},
	};
}

