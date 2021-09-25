import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitAllAmend(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true, amend: true });
	};

	return {
		commandId: 'git.commitAllAmend',
		key: commitAllAmend.name,
		method: commitAllAmend,
		options: {
			repository: true,
		},
	};
}

