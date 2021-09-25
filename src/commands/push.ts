import { PushOptions, PushType, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function push(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.Push });
	};

	return {
		commandId: 'git.push',
		key: push.name,
		method: push,
		options: {
			repository: true,
		},
	};
}

