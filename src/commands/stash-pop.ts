import { ScmCommand } from "../commands.js";
import { Stash } from "../git.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(
	pickStash: (repository: Repository, placeHolder: string) => Promise<Stash | undefined>,
): ScmCommand {
	async function stashPop(repository: Repository): Promise<void> {
		const placeHolder = localize('pick stash to pop', "Pick a stash to pop");
		const stash = await pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		await repository.popStash(stash.index);
	};

	return {
		commandId: 'git.stashPop',
		key: stashPop.name,
		method: stashPop,
		options: {
			repository: true,
		},
	};
}

