import * as path from "node:path";
import { Uri, window, workspace } from "vscode";
import { Repository } from "../../../repository.js";
import { isDescendant, localize, pathEquals } from "../../../util.js";

export async function createStash(repository: Repository, includeUntracked = false): Promise<void> {
	const noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0
		&& (!includeUntracked || repository.untrackedGroup.resourceStates.length === 0);
	const noStagedChanges = repository.indexGroup.resourceStates.length === 0;

	if (noUnstagedChanges && noStagedChanges) {
		window.showInformationMessage(localize('no changes stash', "There are no changes to stash."));
		return;
	}

	const config = workspace.getConfiguration('git', Uri.file(repository.root));
	const promptToSaveFilesBeforeStashing = config.get<'always' | 'staged' | 'never'>('promptToSaveFilesBeforeStash');

	if (promptToSaveFilesBeforeStashing !== 'never') {
		let documents = workspace.textDocuments
			.filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

		if (promptToSaveFilesBeforeStashing === 'staged' || repository.indexGroup.resourceStates.length > 0) {
			documents = documents
				.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
		}

		if (documents.length > 0) {
			const message = documents.length === 1
				? localize('unsaved stash files single', "The following file has unsaved changes which won't be included in the stash if you proceed: {0}.\n\nWould you like to save it before stashing?", path.basename(documents[0].uri.fsPath))
				: localize('unsaved stash files', "There are {0} unsaved files.\n\nWould you like to save them before stashing?", documents.length);
			const saveAndStash = localize('save and stash', "Save All & Stash");
			const stash = localize('stash', "Stash Anyway");
			const pick = await window.showWarningMessage(message, { modal: true }, saveAndStash, stash);

			if (pick === saveAndStash) {
				await Promise.all(documents.map(d => d.save()));
			} else if (pick !== stash) {
				return; // do not stash on cancel
			}
		}
	}

	let message: string | undefined;

	if (config.get<boolean>('useCommitInputAsStashMessage') && (!repository.sourceControl.commitTemplate || repository.inputBox.value !== repository.sourceControl.commitTemplate)) {
		message = repository.inputBox.value;
	}

	message = await window.showInputBox({
		value: message,
		prompt: localize('provide stash message', "Optionally provide a stash message"),
		placeHolder: localize('stash message', "Stash message")
	});

	if (typeof message === 'undefined') {
		return;
	}

	await repository.createStash(message, includeUntracked);
}