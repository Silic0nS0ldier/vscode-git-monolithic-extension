import { window } from "vscode";
import * as path from "node:path";
import { ScmCommand } from "../../helpers.js";
import { Repository, Resource } from "../../../repository.js";
import { localize } from "../../../util.js";
import { categorizeResourceByResolution, stageDeletionConflict } from "./helpers.js";

export function createCommand(): ScmCommand {
	async function stageAllMerge(repository: Repository): Promise<void> {
		const resources = repository.mergeGroup.resourceStates.filter(s => s instanceof Resource) as Resource[];
		const { merge, unresolved, deletionConflicts } = await categorizeResourceByResolution(resources);

		try {
			for (const deletionConflict of deletionConflicts) {
				await stageDeletionConflict(repository, deletionConflict.resourceUri);
			}
		} catch (err) {
			if (/Cancelled/.test(err.message)) {
				return;
			}

			throw err;
		}

		if (unresolved.length > 0) {
			const message = unresolved.length > 1
				? localize('confirm stage files with merge conflicts', "Are you sure you want to stage {0} files with merge conflicts?", merge.length)
				: localize('confirm stage file with merge conflicts', "Are you sure you want to stage {0} with merge conflicts?", path.basename(merge[0].resourceUri.fsPath));

			const yes = localize('yes', "Yes");
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick !== yes) {
				return;
			}
		}

		const uris = resources.map(r => r.resourceUri);

		if (uris.length > 0) {
			await repository.add(uris);
		}
	};

	return {
		commandId: 'git.stageAllMerge',
		method: stageAllMerge,
		options: {
			repository: true,
		},
	};
}

