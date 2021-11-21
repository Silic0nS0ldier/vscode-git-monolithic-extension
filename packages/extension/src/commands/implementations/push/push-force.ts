import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function pushForce(repository: Repository): Promise<void> {
		await push(repository, { pushType: PushType.Push, forcePush: true }, model);
	};

	return {
		commandId: 'git.pushForce',
		method: pushForce,
		options: {
			repository: true,
		},
	};
}

