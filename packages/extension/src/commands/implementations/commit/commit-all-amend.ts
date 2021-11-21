import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitAllAmend(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: true, amend: true });
	};

	return {
		commandId: 'git.commitAllAmend',
		method: commitAllAmend,
		options: {
			repository: true,
		},
	};
}

