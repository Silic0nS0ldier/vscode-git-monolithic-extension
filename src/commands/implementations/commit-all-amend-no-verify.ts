import { CommitOptions } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>,
): ScmCommand {
	async function commitAllAmendNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true, amend: true, noVerify: true });
	};

	return {
		commandId: 'git.commitAllAmendNoVerify',
		method: commitAllAmendNoVerify,
		options: {
			repository: true,
		},
	};
}

