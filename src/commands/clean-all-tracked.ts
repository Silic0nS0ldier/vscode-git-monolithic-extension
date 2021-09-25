import { Status } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository, Resource } from "../repository.js";

export function createCommand(
	cleanTrackedChanges: (repository: Repository, resources: Resource[]) => Promise<void>,
): ScmCommand {
	async function cleanAllTracked(repository: Repository): Promise<void> {
		const resources = repository.workingTreeGroup.resourceStates
			.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);

		if (resources.length === 0) {
			return;
		}

		await cleanTrackedChanges(repository, resources);
	};

	return {
		commandId: 'git.cleanAllTracked',
		key: cleanAllTracked.name,
		method: cleanAllTracked,
		options: {
			repository: true,
		},
	};
}

