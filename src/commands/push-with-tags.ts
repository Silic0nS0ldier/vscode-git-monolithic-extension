import { PushOptions, PushType, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushWithTags(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.PushFollowTags });
	};

	return {
		commandId: 'git.pushWithTags',
		key: pushWithTags.name,
		method: pushWithTags,
		options: {
			repository: true,
		},
	};
}

