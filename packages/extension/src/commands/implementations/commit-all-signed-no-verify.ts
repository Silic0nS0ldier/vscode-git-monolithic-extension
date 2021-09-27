import { CommitOptions } from "../../api/git.js";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>
): ScmCommand {
	async function commitAllSignedNoVerify(repository: Repository): Promise<void> {
		await commitWithAnyInput(repository, { all: true, signoff: true, noVerify: true });
	};

	return {
		commandId: 'git.commitAllSignedNoVerify',
		method: commitAllSignedNoVerify,
		options: {
			repository: true,
		},
	};
}

