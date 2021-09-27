import { CommitOptions } from "../../api/git.js";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { noVerify: true });
	};

	return {
		commandId: 'git.commitNoVerify',
		method: commitNoVerify,
		options: {
			repository: true,
		},
	};
}

