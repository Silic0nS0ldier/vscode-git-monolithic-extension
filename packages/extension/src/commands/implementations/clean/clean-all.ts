import { window } from "vscode";
import * as path from "node:path";
import { Status } from "../../../api/git.js";
import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";
import { cleanTrackedChanges, cleanUntrackedChange, cleanUntrackedChanges } from "./helpers.js";

export async function cleanAll(repository: Repository): Promise<void> {
	let resources = repository.workingTreeGroup.resourceStates;

		if (resources.length === 0) {
			return;
		}

		const trackedResources = resources.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);
		const untrackedResources = resources.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);

		if (untrackedResources.length === 0) {
			await cleanTrackedChanges(repository, resources);
		} else if (resources.length === 1) {
			await cleanUntrackedChange(repository, resources[0]);
		} else if (trackedResources.length === 0) {
			await cleanUntrackedChanges(repository, resources);
		} else { // resources.length > 1 && untrackedResources.length > 0 && trackedResources.length > 0
			const untrackedMessage = untrackedResources.length === 1
				? localize('there are untracked files single', "The following untracked file will be DELETED FROM DISK if discarded: {0}.", path.basename(untrackedResources[0].resourceUri.fsPath))
				: localize('there are untracked files', "There are {0} untracked files which will be DELETED FROM DISK if discarded.", untrackedResources.length);

			const message = localize('confirm discard all 2', "{0}\n\nThis is IRREVERSIBLE, your current working set will be FOREVER LOST.", untrackedMessage, resources.length);

			const yesTracked = trackedResources.length === 1
				? localize('yes discard tracked', "Discard 1 Tracked File", trackedResources.length)
				: localize('yes discard tracked multiple', "Discard {0} Tracked Files", trackedResources.length);

			const yesAll = localize('discardAll', "Discard All {0} Files", resources.length);
			const pick = await window.showWarningMessage(message, { modal: true }, yesTracked, yesAll);

			if (pick === yesTracked) {
				resources = trackedResources;
			} else if (pick !== yesAll) {
				return;
			}

			await repository.clean(resources.map(r => r.resourceUri));
		}
}

export function createCommand(): ScmCommand {
	return {
		commandId: 'git.cleanAll',
		method: cleanAll,
		options: {
			repository: true,
		},
	};
}

