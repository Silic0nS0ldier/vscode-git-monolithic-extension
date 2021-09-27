import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	commitEmptyFn: (repository: Repository, noVerify?: boolean) => Promise<void>,
): ScmCommand {
	async function commitEmpty(repository: Repository): Promise<void> {
		await commitEmptyFn(repository);
	};

	return {
		commandId: 'git.commitEmpty',
		method: commitEmpty,
		options: {
			repository: true,
		},
	};
}

