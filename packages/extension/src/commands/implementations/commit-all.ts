import { CommitOptions } from "../../api/git.js";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitAll(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true });
	};

	return {
		commandId: 'git.commitAll',
		method: commitAll,
		options: {
			repository: true,
		},
	};
}

