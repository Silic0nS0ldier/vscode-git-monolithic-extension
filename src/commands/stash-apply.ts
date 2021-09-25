import { ScmCommand } from "../commands.js";
import { Stash } from "../git.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(
	pickStash: (repository: Repository, placeHolder: string) => Promise<Stash | undefined>,
): ScmCommand {
	async function stashApply(repository: Repository): Promise<void> {
		const placeHolder = localize('pick stash to apply', "Pick a stash to apply");
		const stash = await pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		await repository.applyStash(stash.index);
	};

	return {
		commandId: 'git.stashApply',
		key: stashApply.name,
		method: stashApply,
		options: {
			repository: true,
		},
	};
}

