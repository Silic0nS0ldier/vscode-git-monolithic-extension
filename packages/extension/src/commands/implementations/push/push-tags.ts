import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function pushTags(repository: Repository): Promise<void> {
		await push(repository, { pushType: PushType.PushTags }, model);
	};

	return {
		commandId: 'git.pushTags',
		method: pushTags,
		options: {
			repository: true,
		},
	};
}

