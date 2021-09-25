import { PushOptions, PushType, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushForce(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.Push, forcePush: true });
	};

	return {
		commandId: 'git.pushForce',
		key: pushForce.name,
		method: pushForce,
		options: {
			repository: true,
		},
	};
}

