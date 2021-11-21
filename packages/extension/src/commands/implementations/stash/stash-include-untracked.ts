import { ScmCommand } from "../../helpers.js";
import { Repository } from "../../../repository.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
	async function stashIncludeUntracked(repository: Repository): Promise<void> {
		await createStash(repository, true);
	};

	return {
		commandId: 'git.stashIncludeUntracked',
		method: stashIncludeUntracked,
		options: {
			repository: true,
		},
	};
}

