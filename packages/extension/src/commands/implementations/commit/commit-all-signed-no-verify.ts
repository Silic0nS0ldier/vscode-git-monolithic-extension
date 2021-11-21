import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitAllSignedNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, model, { all: true, signoff: true, noVerify: true });
	};

	return {
		commandId: 'git.commitAllSignedNoVerify',
		method: commitAllSignedNoVerify,
		options: {
			repository: true,
		},
	};
}

