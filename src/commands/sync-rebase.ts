import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	syncFn: (repository: Repository, rebase: boolean) => Promise<void>,
): ScmCommand {
	async function syncRebase(repository: Repository): Promise<void> {
		try {
			await syncFn(repository, true);
		} catch (err) {
			if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
				return;
			}

			throw err;
		}
	};

	return {
		commandId: 'git.syncRebase',
		key: syncRebase.name,
		method: syncRebase,
		options: {
			repository: true,
		},
	};
}

