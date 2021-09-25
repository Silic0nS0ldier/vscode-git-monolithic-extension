import { Uri, workspace } from "vscode";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(): ScmCommand {
	async function stageAll(repository: Repository): Promise<void> {
		const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates];
		const uris = resources.map(r => r.resourceUri);

		if (uris.length > 0) {
			const config = workspace.getConfiguration('git', Uri.file(repository.root));
			const untrackedChanges = config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges');
			await repository.add(uris, untrackedChanges === 'mixed' ? undefined : { update: true });
		}
	};

	return {
		commandId: 'git.stageAll',
		key: stageAll.name,
		method: stageAll,
		options: {
			repository: true,
		},
	};
}

