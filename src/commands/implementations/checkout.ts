import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	checkoutFn: (repository: Repository, opts?: { detached?: boolean, treeish?: string }) => Promise<boolean>
): ScmCommand {
	async function checkout(repository: Repository, treeish?: string): Promise<boolean> {
		return checkoutFn(repository, { treeish });
	};

	return {
		commandId: 'git.checkout',
		method: checkout,
		options: {
			repository: true,
		},
	};
}

