import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
	async function commitEmptyFn(repository: Repository): Promise<void> {
		await commitEmpty(repository, model);
	};

	return {
		commandId: 'git.commitEmpty',
		method: commitEmptyFn,
		options: {
			repository: true,
		},
	};
}

