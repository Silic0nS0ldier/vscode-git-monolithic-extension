import { PushOptions, ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { PushType } from "./helpers.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushWithTags(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.PushFollowTags });
	};

	return {
		commandId: 'git.pushWithTags',
		method: pushWithTags,
		options: {
			repository: true,
		},
	};
}

