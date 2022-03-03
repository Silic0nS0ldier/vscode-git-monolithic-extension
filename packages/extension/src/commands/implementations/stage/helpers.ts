import * as path from "node:path";
import { Uri, window } from "vscode";
import { Status } from "../../../api/git.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import { grep, localize } from "../../../util.js";

export async function categorizeResourceByResolution(
    resources: Resource[],
): Promise<{ merge: Resource[]; resolved: Resource[]; unresolved: Resource[]; deletionConflicts: Resource[] }> {
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
        ...possibleUnresolved.filter((_s, i) => unresolvedBothModified[i]),
    ];

    return { deletionConflicts, merge, resolved, unresolved };
}

export async function stageDeletionConflict(repository: AbstractRepository, uri: Uri): Promise<void> {
    const uriString = uri.toString();
    const resource = repository.mergeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];

    if (!resource) {
        return;
    }

    if (resource.type === Status.DELETED_BY_THEM) {
        const keepIt = localize("keep ours", "Keep Our Version");
        const deleteIt = localize("delete", "Delete File");
        const result = await window.showInformationMessage(
            localize(
                "deleted by them",
                "File '{0}' was deleted by them and modified by us.\n\nWhat would you like to do?",
                path.basename(uri.fsPath),
            ),
            { modal: true },
            keepIt,
            deleteIt,
        );

        if (result === keepIt) {
            await repository.add([uri]);
        } else if (result === deleteIt) {
            await repository.rm([uri]);
        } else {
            throw new Error("Cancelled");
        }
    } else if (resource.type === Status.DELETED_BY_US) {
        const keepIt = localize("keep theirs", "Keep Their Version");
        const deleteIt = localize("delete", "Delete File");
        const result = await window.showInformationMessage(
            localize(
                "deleted by us",
                "File '{0}' was deleted by us and modified by them.\n\nWhat would you like to do?",
                path.basename(uri.fsPath),
            ),
            { modal: true },
            keepIt,
            deleteIt,
        );

        if (result === keepIt) {
            await repository.add([uri]);
        } else if (result === deleteIt) {
            await repository.rm([uri]);
        } else {
            throw new Error("Cancelled");
        }
    }
}

// private async _stageChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
// 	const modifiedDocument = textEditor.document;
// 	const modifiedUri = modifiedDocument.uri;

// 	if (modifiedUri.scheme !== 'file') {
// 		return;
// 	}

// 	const originalUri = toGitUri(modifiedUri, '~');
// 	const originalDocument = await workspace.openTextDocument(originalUri);
// 	const result = applyLineChanges(originalDocument, modifiedDocument, changes);

// 	await this.runByRepository(
// 		[modifiedUri],
// 		async (repository, resources) => {
// 			for (const resource of resources) {
// 				await repository.stage(resource, result);
// 			}
// 		});
// }

// private async _revertChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
// 	const modifiedDocument = textEditor.document;
// 	const modifiedUri = modifiedDocument.uri;

// 	if (modifiedUri.scheme !== 'file') {
// 		return;
// 	}

// 	const originalUri = toGitUri(modifiedUri, '~');
// 	const originalDocument = await workspace.openTextDocument(originalUri);
// 	const visibleRangesBeforeRevert = textEditor.visibleRanges;
// 	const result = applyLineChanges(originalDocument, modifiedDocument, changes);

// 	const edit = new WorkspaceEdit();
// 	edit.replace(modifiedUri, new Range(new Position(0, 0), modifiedDocument.lineAt(modifiedDocument.lineCount - 1).range.end), result);
// 	workspace.applyEdit(edit);

// 	await modifiedDocument.save();

// 	textEditor.revealRange(visibleRangesBeforeRevert[0]);
// }

// resolveTimelineOpenDiffCommand(item: TimelineItem, uri: Uri | undefined, options?: TextDocumentShowOptions): Command | undefined {
// 	if (uri === undefined || uri === null || !GitTimelineItem.is(item)) {
// 		return undefined;
// 	}

// 	const basename = path.basename(uri.fsPath);

// 	let title;
// 	if ((item.previousRef === 'HEAD' || item.previousRef === '~') && item.ref === '') {
// 		title = localize('git.title.workingTree', '{0} (Working Tree)', basename);
// 	}
// 	else if (item.previousRef === 'HEAD' && item.ref === '~') {
// 		title = localize('git.title.index', '{0} (Index)', basename);
// 	} else {
// 		title = localize('git.title.diffRefs', '{0} ({1}) ⟷ {0} ({2})', basename, item.shortPreviousRef, item.shortRef);
// 	}

// 	return {
// 		command: 'vscode.diff',
// 		title: 'Open Comparison',
// 		arguments: [toGitUri(uri, item.previousRef), item.ref === '' ? uri : toGitUri(uri, item.ref), title, options]
// 	};
// }

// private _selectedForCompare: { uri: Uri, item: GitTimelineItem } | undefined;
