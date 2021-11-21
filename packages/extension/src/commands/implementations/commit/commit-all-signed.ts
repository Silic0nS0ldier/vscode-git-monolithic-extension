import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitAllSigned(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: true, signoff: true });
	};

	return {
		commandId: 'git.commitAllSigned',
		method: commitAllSigned,
		options: {
			repository: true,
		},
	};
}

