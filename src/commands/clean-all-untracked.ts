import { Status } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository, Resource } from "../repository.js";

export function createCommand(
	cleanUntrackedChange: (repository: Repository, resource: Resource) => Promise<void>,
	cleanUntrackedChanges: (repository: Repository, resources: Resource[]) => Promise<void>,
): ScmCommand {
	async function cleanAllUntracked(repository: Repository): Promise<void> {
		const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates]
			.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);

		if (resources.length === 0) {
			return;
		}

		if (resources.length === 1) {
			await cleanUntrackedChange(repository, resources[0]);
		} else {
			await cleanUntrackedChanges(repository, resources);
		}
	};

	return {
		commandId: 'git.cleanAllUntracked',
		method: cleanAllUntracked,
		options: {
			repository: true,
		},
	};
}

