import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { checkout } from "./checkout.js";

export function createCommand(): ScmCommand {
	async function checkoutDetached(repository: Repository, treeish?: string): Promise<boolean> {
		return checkout(repository, { detached: true, treeish });
	};

	return {
		commandId: 'git.checkoutDetached',
		method: checkoutDetached,
		options: {
			repository: true,
		},
	};
}

