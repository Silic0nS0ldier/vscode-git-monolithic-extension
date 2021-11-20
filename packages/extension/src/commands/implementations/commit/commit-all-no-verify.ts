import { CommitOptions } from "../../../api/git.js";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitAllNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true, noVerify: true });
	};

	return {
		commandId: 'git.commitAllNoVerify',
		method: commitAllNoVerify,
		options: {
			repository: true,
		},
	};
}

