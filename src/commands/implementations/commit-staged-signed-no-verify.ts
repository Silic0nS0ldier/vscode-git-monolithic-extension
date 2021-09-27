import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStagedSignedNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false, signoff: true, noVerify: true });
	};

	return {
		commandId: 'git.commitStagedSignedNoVerify',
		method: commitStagedSignedNoVerify,
		options: {
			repository: true,
		},
	};
}

