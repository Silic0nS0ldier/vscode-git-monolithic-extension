import { SourceControlResourceState, Uri } from "vscode";
import { RunByRepository, ScmCommand } from "../commands.js";
import { Resource, ResourceGroupType } from "../repository.js";

export function createCommand(
	getSCMResource: (uri?: Uri) => Resource | undefined,
	runByRepository: RunByRepository<void>,
): ScmCommand {
	async function unstage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const scmResources = resourceStates
			.filter(s => s instanceof Resource && s.resourceGroupType === ResourceGroupType.Index) as Resource[];

		if (!scmResources.length) {
			return;
		}

		const resources = scmResources.map(r => r.resourceUri);
		await runByRepository(resources, async (repository, resources) => repository.revert(resources));
	};

	return {
		commandId: 'git.unstage',
		key: unstage.name,
		method: unstage,
		options: {},
	};
}

