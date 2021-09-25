import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStagedSigned(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false, signoff: true });
	};

	return {
		commandId: 'git.commitStagedSigned',
		method: commitStagedSigned,
		options: {
			repository: true,
		},
	};
}

