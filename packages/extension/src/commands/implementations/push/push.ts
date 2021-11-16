import { PushOptions, ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { PushType } from "./helpers.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function push(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.Push });
	};

	return {
		commandId: 'git.push',
		method: push,
		options: {
			repository: true,
		},
	};
}

