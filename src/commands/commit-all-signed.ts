import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitAllSigned(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true, signoff: true });
	};

	return {
		commandId: 'git.commitAllSigned',
		key: commitAllSigned.name,
		method: commitAllSigned,
		options: {
			repository: true,
		},
	};
}

