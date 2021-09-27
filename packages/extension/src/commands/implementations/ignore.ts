import { SourceControlResourceState, Uri } from "vscode";
import { RunByRepository, ScmCommand } from "../../commands.js";
import { Resource } from "../../repository.js";

export function createCommand(
	runByRepository: RunByRepository<void>,
	getSCMResource: (uri?: Uri) => Resource | undefined,
): ScmCommand {
	async function ignore(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const resources = resourceStates
			.filter(s => s instanceof Resource)
			.map(r => r.resourceUri);

		if (!resources.length) {
			return;
		}

		await runByRepository(resources, async (repository, resources) => repository.ignore(resources));
	};

	return {
		commandId: 'git.ignore',
		method: ignore,
		options: {},
	};
}

