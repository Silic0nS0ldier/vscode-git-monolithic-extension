import { OutputChannel, SourceControlResourceState, Uri, window } from "vscode";
import * as path from 'node:path';
import type { RunByRepository, ScmCommand } from "../../../commands.js";
import { Resource, ResourceGroupType } from "../../../repository.js";
import { localize } from "../../../util.js";
import { categorizeResourceByResolution, stageDeletionConflict } from "./helpers.js";

export function createCommand(
	getSCMResource: (uri?: Uri) => Resource | undefined,
	outputChannel: OutputChannel,
	runByRepository: RunByRepository,
): ScmCommand {
	async function stage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		outputChannel.appendLine(`git.stage ${resourceStates.length}`);

		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = getSCMResource();

			outputChannel.appendLine(`git.stage.getSCMResource ${resource ? resource.resourceUri.toString() : null}`);

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const selection = resourceStates.filter(s => s instanceof Resource) as Resource[];
		const { resolved, unresolved, deletionConflicts } = await categorizeResourceByResolution(selection);

		if (unresolved.length > 0) {
			const message = unresolved.length > 1
				? localize('confirm stage files with merge conflicts', "Are you sure you want to stage {0} files with merge conflicts?", unresolved.length)
				: localize('confirm stage file with merge conflicts', "Are you sure you want to stage {0} with merge conflicts?", path.basename(unresolved[0].resourceUri.fsPath));

			const yes = localize('yes', "Yes");
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick !== yes) {
				return;
			}
		}

		try {
			await runByRepository(deletionConflicts.map(r => r.resourceUri), async (repository, resources) => {
				for (const resource of resources) {
					await stageDeletionConflict(repository, resource);
				}
			});
		} catch (err) {
			if (/Cancelled/.test(err.message)) {
				return;
			}

			throw err;
		}

		const workingTree = selection.filter(s => s.resourceGroupType === ResourceGroupType.WorkingTree);
		const untracked = selection.filter(s => s.resourceGroupType === ResourceGroupType.Untracked);
		const scmResources = [...workingTree, ...untracked, ...resolved, ...unresolved];

		outputChannel.appendLine(`git.stage.scmResources ${scmResources.length}`);
		if (!scmResources.length) {
			return;
		}

		const resources = scmResources.map(r => r.resourceUri);
		await runByRepository(resources, async (repository, resources) => repository.add(resources));
	};

	return {
		commandId: 'git.stage',
		method: stage,
		options: {},
	};
}

