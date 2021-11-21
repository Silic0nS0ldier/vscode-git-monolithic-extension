import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function pushWithTagsForce(repository: Repository): Promise<void> {
		await push(repository, { pushType: PushType.PushFollowTags, forcePush: true }, model);
	};

	return {
		commandId: 'git.pushWithTagsForce',
		method: pushWithTagsForce,
		options: {
			repository: true,
		},
	};
}

