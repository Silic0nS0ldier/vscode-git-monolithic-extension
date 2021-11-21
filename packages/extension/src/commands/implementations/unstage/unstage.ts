import { OutputChannel, SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../../helpers.js";
import { Model } from "../../../model.js";
import { Resource, ResourceGroupType } from "../../../repository.js";
import { getSCMResource, runByRepository } from "../../helpers.js";

export function createCommand(
	outputChannel: OutputChannel,
	model: Model,
): ScmCommand {
	async function unstage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = getSCMResource(model, outputChannel);

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
		await runByRepository(model, resources, async (repository, resources) => repository.revert(resources));
	};

	return {
		commandId: 'git.unstage',
		method: unstage,
		options: {},
	};
}

