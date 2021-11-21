import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitStagedSigned(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: false, signoff: true });
	};

	return {
		commandId: 'git.commitStagedSigned',
		method: commitStagedSigned,
		options: {
			repository: true,
		},
	};
}

