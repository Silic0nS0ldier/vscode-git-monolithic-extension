import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitStaged(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: false });
	};

	return {
		commandId: 'git.commitStaged',
		method: commitStaged,
		options: {
			repository: true,
		},
	};
}

