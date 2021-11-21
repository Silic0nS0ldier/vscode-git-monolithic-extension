import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { sync as syncFn } from "./helper.js";

export async function syncCmdImpl(repository: Repository, model: Model): Promise<void> {
	try {
		await syncFn(repository, false, model);
	} catch (err) {
		if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
			return;
		}

		throw err;
	}
}

export function createCommand(model: Model): ScmCommand {
	async function sync(repository: Repository): Promise<void> {
		await syncCmdImpl(repository, model);
	};

	return {
		commandId: 'git.sync',
		method: sync,
		options: {
			repository: true,
		},
	};
}

