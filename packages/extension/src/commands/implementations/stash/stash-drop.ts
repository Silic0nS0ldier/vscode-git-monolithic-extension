import { window } from "vscode";
import { ScmCommand } from "../../../commands.js";
import { Stash } from "../../../git.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export function createCommand(
	pickStash: (repository: Repository, placeHolder: string) => Promise<Stash | undefined>,
): ScmCommand {
	async function stashDrop(repository: Repository): Promise<void> {
		const placeHolder = localize('pick stash to drop', "Pick a stash to drop");
		const stash = await pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		// request confirmation for the operation
		const yes = localize('yes', "Yes");
		const result = await window.showWarningMessage(
			localize('sure drop', "Are you sure you want to drop the stash: {0}?", stash.description),
			yes
		);
		if (result !== yes) {
			return;
		}

		await repository.dropStash(stash.index);
	};

	return {
		commandId: 'git.stashDrop',
		method: stashDrop,
		options: {
			repository: true,
		},
	};
}

