import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { sync as syncFn } from "./helper.js";

export async function sync(repository: Repository, model: Model): Promise<void> {
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
	async function syncFn(repository: Repository): Promise<void> {
		await sync(repository, model);
	};

	return {
		commandId: 'git.sync',
		method: syncFn,
		options: {
			repository: true,
		},
	};
}

