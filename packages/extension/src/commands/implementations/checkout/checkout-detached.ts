import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";

export function createCommand(
	checkoutFn: (repository: Repository, opts?: { detached?: boolean, treeish?: string }) => Promise<boolean>,
): ScmCommand {
	async function checkoutDetached(repository: Repository, treeish?: string): Promise<boolean> {
		return checkoutFn(repository, { detached: true, treeish });
	};

	return {
		commandId: 'git.checkoutDetached',
		method: checkoutDetached,
		options: {
			repository: true,
		},
	};
}

