import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitStagedAmendNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: false, amend: true, noVerify: true });
	};

	return {
		commandId: 'git.commitStagedAmendNoVerify',
		method: commitStagedAmendNoVerify,
		options: {
			repository: true,
		},
	};
}

