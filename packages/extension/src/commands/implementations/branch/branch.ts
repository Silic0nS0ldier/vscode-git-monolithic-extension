import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	branchFn: (repository: Repository, defaultName?: string, from?: boolean) => Promise<void>,
): ScmCommand {
	async function branch(repository: Repository): Promise<void> {
		await branchFn(repository);
	};

	return {
		commandId: 'git.branch',
		method: branch,
		options: {
			repository: true,
		},
	};
}

