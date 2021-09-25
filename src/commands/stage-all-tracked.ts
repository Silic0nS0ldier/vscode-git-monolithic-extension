import { Status } from "../api/git.js";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(): ScmCommand {
	async function stageAllTracked(repository: Repository): Promise<void> {
		const resources = repository.workingTreeGroup.resourceStates
			.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);
		const uris = resources.map(r => r.resourceUri);

		await repository.add(uris);
	};

	return {
		commandId: 'git.stageAllTracked',
		key: stageAllTracked.name,
		method: stageAllTracked,
		options: {
			repository: true,
		},
	};
}

