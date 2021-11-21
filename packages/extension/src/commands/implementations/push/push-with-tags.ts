import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function pushWithTags(repository: Repository): Promise<void> {
		await push(repository, { pushType: PushType.PushFollowTags }, model);
	};

	return {
		commandId: 'git.pushWithTags',
		method: pushWithTags,
		options: {
			repository: true,
		},
	};
}

