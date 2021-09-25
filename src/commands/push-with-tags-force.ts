import { PushOptions, PushType, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushWithTagsForce(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.PushFollowTags, forcePush: true });
	};

	return {
		commandId: 'git.pushWithTagsForce',
		key: pushWithTagsForce.name,
		method: pushWithTagsForce,
		options: {
			repository: true,
		},
	};
}

