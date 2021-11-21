import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitAll(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: true });
	};

	return {
		commandId: 'git.commitAll',
		method: commitAll,
		options: {
			repository: true,
		},
	};
}

