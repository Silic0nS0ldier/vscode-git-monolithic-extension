import { SourceControlResourceState, Uri, window } from "vscode";
import * as path from "node:path";
import { Status } from "../../../api/git.js";
import { RunByRepository, ScmCommand } from "../../../commands.js";
import { Resource, ResourceGroupType } from "../../../repository.js";
import { localize } from "../../../util.js";

export function createCommand(
	runByRepository: RunByRepository<void>,
	getSCMResource: (uri?: Uri) => Resource | undefined,
): ScmCommand {
	async function clean(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const scmResources = resourceStates.filter(s => s instanceof Resource
			&& (s.resourceGroupType === ResourceGroupType.WorkingTree || s.resourceGroupType === ResourceGroupType.Untracked)) as Resource[];

		if (!scmResources.length) {
			return;
		}

		const untrackedCount = scmResources.reduce((s, r) => s + (r.type === Status.UNTRACKED ? 1 : 0), 0);
		let message: string;
		let yes = localize('discard', "Discard Changes");

		if (scmResources.length === 1) {
			if (untrackedCount > 0) {
				message = localize('confirm delete', "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.", path.basename(scmResources[0].resourceUri.fsPath));
				yes = localize('delete file', "Delete file");
			} else {
				if (scmResources[0].type === Status.DELETED) {
					yes = localize('restore file', "Restore file");
					message = localize('confirm restore', "Are you sure you want to restore {0}?", path.basename(scmResources[0].resourceUri.fsPath));
				} else {
					message = localize('confirm discard', "Are you sure you want to discard changes in {0}?", path.basename(scmResources[0].resourceUri.fsPath));
				}
			}
		} else {
			if (scmResources.every(resource => resource.type === Status.DELETED)) {
				yes = localize('restore files', "Restore files");
				message = localize('confirm restore multiple', "Are you sure you want to restore {0} files?", scmResources.length);
			} else {
				message = localize('confirm discard multiple', "Are you sure you want to discard changes in {0} files?", scmResources.length);
			}

			if (untrackedCount > 0) {
				message = `${message}\n\n${localize('warn untracked', "This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.", untrackedCount)}`;
			}
		}

		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		const resources = scmResources.map(r => r.resourceUri);
		await runByRepository(resources, async (repository, resources) => repository.clean(resources));
	};

	return {
		commandId: 'git.clean',
		method: clean,
		options: {},
	};
}

