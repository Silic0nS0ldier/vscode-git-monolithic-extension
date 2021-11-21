import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitStagedSignedNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: false, signoff: true, noVerify: true });
	};

	return {
		commandId: 'git.commitStagedSignedNoVerify',
		method: commitStagedSignedNoVerify,
		options: {
			repository: true,
		},
	};
}

