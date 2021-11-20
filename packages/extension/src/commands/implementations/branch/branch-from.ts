import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { branch } from "./helpers.js";

export function createCommand(): ScmCommand {
	async function branchFrom(repository: Repository): Promise<void> {
		await branch(repository, undefined, true);
	};

	return {
		commandId: 'git.branchFrom',
		method: branchFrom,
		options: {
			repository: true,
		},
	};
}

