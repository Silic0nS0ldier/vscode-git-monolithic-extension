import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { PushOptions, PushType } from "./helpers.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushTags(repository: Repository): Promise<void> {
		await pushFn(repository, { pushType: PushType.PushTags });
	};

	return {
		commandId: 'git.pushTags',
		method: pushTags,
		options: {
			repository: true,
		},
	};
}

