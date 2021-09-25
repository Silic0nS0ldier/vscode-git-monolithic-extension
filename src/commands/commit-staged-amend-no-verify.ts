import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStagedAmendNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false, amend: true, noVerify: true });
	};

	return {
		commandId: 'git.commitStagedAmendNoVerify',
		key: commitStagedAmendNoVerify.name,
		method: commitStagedAmendNoVerify,
		options: {
			repository: true,
		},
	};
}

