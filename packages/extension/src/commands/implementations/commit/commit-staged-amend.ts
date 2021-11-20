import { CommitOptions } from "../../../api/git.js";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStagedAmend(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false, amend: true });
	};

	return {
		commandId: 'git.commitStagedAmend',
		method: commitStagedAmend,
		options: {
			repository: true,
		},
	};
}

