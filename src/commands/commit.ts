import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commit(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository);
	};

	return {
		commandId: 'git.commit',
		method: commit,
		options: {
			repository: true,
		},
	};
}

