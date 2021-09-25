import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitEmptyFn: (repository: Repository, noVerify?: boolean) => Promise<void>,
): ScmCommand {
	async function commitEmptyNoVerify(repository: Repository): Promise<void> {
		await commitEmptyFn(repository, true);
	};

	return {
		commandId: 'git.commitEmptyNoVerify',
		method: commitEmptyNoVerify,
		options: {
			repository: true,
		},
	};
}

