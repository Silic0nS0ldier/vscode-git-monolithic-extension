import { CommitOptions } from "../../api/git.js";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitStagedNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: false, noVerify: true });
	};

	return {
		commandId: 'git.commitStagedNoVerify',
		method: commitStagedNoVerify,
		options: {
			repository: true,
		},
	};
}

