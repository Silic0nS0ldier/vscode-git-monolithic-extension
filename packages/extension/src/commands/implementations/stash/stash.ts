
import { ScmCommand } from "../../helpers.js";
import { Repository } from "../../../repository.js";
import { createStash } from "./helpers.js";


export function createCommand(): ScmCommand {
	async function stashWithoutUntracked(repository: Repository) {
		await createStash(repository);
	};

	return {
		commandId: 'git.stash',
		method: stashWithoutUntracked,
		options: {
			repository: true,
		},
	};
}


