import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export async function syncCmdImpl(
	syncFn: (repository: Repository, rebase: boolean) => Promise<void>,
	repository: Repository
): Promise<void> {
	try {
		await syncFn(repository, false);
	} catch (err) {
		if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
			return;
		}

		throw err;
	}
}

export function createCommand(
	syncFn: (repository: Repository, rebase: boolean) => Promise<void>,
): ScmCommand {
	async function sync(repository: Repository): Promise<void> {
		await syncCmdImpl(syncFn, repository);
	};

	return {
		commandId: 'git.sync',
		key: sync.name,
		method: sync,
		options: {
			repository: true,
		},
	};
}

