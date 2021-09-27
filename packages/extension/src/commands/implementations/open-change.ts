import { SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../../commands.js";
import { Resource } from "../../repository.js";

export function createCommand(
	getSCMResource: (uri?: Uri) => Resource | undefined,
): ScmCommand {
	async function openChange(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		let resources: Resource[] | undefined = undefined;

		if (arg instanceof Uri) {
			const resource = getSCMResource(arg);
			if (resource !== undefined) {
				resources = [resource];
			}
		} else {
			let resource: Resource | undefined = undefined;

			if (arg instanceof Resource) {
				resource = arg;
			} else {
				resource = getSCMResource();
			}

			if (resource) {
				resources = [...resourceStates as Resource[], resource];
			}
		}

		if (!resources) {
			return;
		}

		for (const resource of resources) {
			await resource.openChange();
		}
	};

	return {
		commandId: 'git.openChange',
		method: openChange,
		options: {},
	};
}

