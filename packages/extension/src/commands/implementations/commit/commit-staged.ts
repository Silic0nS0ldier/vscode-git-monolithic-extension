import { CommitOptions } from "../../../api/git.js";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStaged(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false });
	};

	return {
		commandId: 'git.commitStaged',
		method: commitStaged,
		options: {
			repository: true,
		},
	};
}

