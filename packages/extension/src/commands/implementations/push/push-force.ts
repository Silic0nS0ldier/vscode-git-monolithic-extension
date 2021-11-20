import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { PushOptions, PushType } from "./helpers.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushForce(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.Push, forcePush: true });
	};

	return {
		commandId: 'git.pushForce',
		method: pushForce,
		options: {
			repository: true,
		},
	};
}

