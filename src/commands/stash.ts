import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export async function stashCmdImpl(
	stashFn: (repository: Repository, includeUntracked?: boolean) => Promise<void>,
	repository: Repository
) {
	await stashFn(repository);
}

export function createCommand(
	stashFn: (repository: Repository, includeUntracked?: boolean) => Promise<void>,
): ScmCommand {
	async function stash(repository: Repository): Promise<void> {
		await stashCmdImpl(stashFn, repository);
	};

	return {
		commandId: 'git.stash',
		method: stash,
		options: {
			repository: true,
		},
	};
}

