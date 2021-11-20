import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	stashFn: (repository: Repository, includeUntracked?: boolean) => Promise<void>,
): ScmCommand {
	async function stashIncludeUntracked(repository: Repository): Promise<void> {
		await stashFn(repository, true);
	};

	return {
		commandId: 'git.stashIncludeUntracked',
		method: stashIncludeUntracked,
		options: {
			repository: true,
		},
	};
}

