import { OutputChannel, SourceControlResourceState, Uri } from "vscode";
import { ScmCommand } from "../../../helpers.js";
import { Model } from "../../../../model.js";
import { Resource } from "../../../../repository.js";
import { getSCMResource } from "../../../helpers.js";

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
	async function openChange(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		let resources: Resource[] | undefined = undefined;

		if (arg instanceof Uri) {
			const resource = getSCMResource(model, outputChannel, arg);
			if (resource !== undefined) {
				resources = [resource];
			}
		} else {
			let resource: Resource | undefined = undefined;

			if (arg instanceof Resource) {
				resource = arg;
			} else {
				resource = getSCMResource(model, outputChannel);
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

