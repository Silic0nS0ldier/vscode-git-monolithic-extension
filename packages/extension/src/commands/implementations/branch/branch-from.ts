import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	branchFn: (repository: Repository, defaultName?: string, from?: boolean) => Promise<void>,
): ScmCommand {
	async function branchFrom(repository: Repository): Promise<void> {
		await branchFn(repository, undefined, true);
	};

	return {
		commandId: 'git.branchFrom',
		method: branchFrom,
		options: {
			repository: true,
		},
	};
}

