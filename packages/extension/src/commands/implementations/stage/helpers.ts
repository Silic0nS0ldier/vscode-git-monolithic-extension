import * as path from "node:path";
import { Uri, window } from "vscode";
import { Status } from "../../../api/git.js";
import { Repository, Resource, ResourceGroupType } from "../../../repository.js";
import { grep, localize } from "../../../util.js";

export async function categorizeResourceByResolution(resources: Resource[]): Promise<{ merge: Resource[], resolved: Resource[], unresolved: Resource[], deletionConflicts: Resource[] }> {
	const selection = resources.filter(s => s instanceof Resource) as Resource[];
	const merge = selection.filter(s => s.resourceGroupType === ResourceGroupType.Merge);
	const isBothAddedOrModified = (s: Resource) => s.type === Status.BOTH_MODIFIED || s.type === Status.BOTH_ADDED;
	const isAnyDeleted = (s: Resource) => s.type === Status.DELETED_BY_THEM || s.type === Status.DELETED_BY_US;
	const possibleUnresolved = merge.filter(isBothAddedOrModified);
	const promises = possibleUnresolved.map(s => grep(s.resourceUri.fsPath, /^<{7}|^={7}|^>{7}/));
	const unresolvedBothModified = await Promise.all<boolean>(promises);
	const resolved = possibleUnresolved.filter((_s, i) => !unresolvedBothModified[i]);
	const deletionConflicts = merge.filter(s => isAnyDeleted(s));
	const unresolved = [
		...merge.filter(s => !isBothAddedOrModified(s) && !isAnyDeleted(s)),
		...possibleUnresolved.filter((_s, i) => unresolvedBothModified[i])
	];

	return { merge, resolved, unresolved, deletionConflicts };
}

export async function stageDeletionConflict(repository: Repository, uri: Uri): Promise<void> {
	const uriString = uri.toString();
	const resource = repository.mergeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];

	if (!resource) {
		return;
	}

	if (resource.type === Status.DELETED_BY_THEM) {
		const keepIt = localize('keep ours', "Keep Our Version");
		const deleteIt = localize('delete', "Delete File");
		const result = await window.showInformationMessage(localize('deleted by them', "File '{0}' was deleted by them and modified by us.\n\nWhat would you like to do?", path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

		if (result === keepIt) {
			await repository.add([uri]);
		} else if (result === deleteIt) {
			await repository.rm([uri]);
		} else {
			throw new Error('Cancelled');
		}
	} else if (resource.type === Status.DELETED_BY_US) {
		const keepIt = localize('keep theirs', "Keep Their Version");
		const deleteIt = localize('delete', "Delete File");
		const result = await window.showInformationMessage(localize('deleted by us', "File '{0}' was deleted by us and modified by them.\n\nWhat would you like to do?", path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

		if (result === keepIt) {
			await repository.add([uri]);
		} else if (result === deleteIt) {
			await repository.rm([uri]);
		} else {
			throw new Error('Cancelled');
		}
	}
}
