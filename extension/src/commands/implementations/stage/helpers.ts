import { type TextDocument, Uri, window } from "vscode";
import type { ILineChange } from "vscode-diff/dist/vs/editor/common/diff/legacyLinesDiffComputer.js";
import { Status } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import { applyLineChanges } from "../../../staging.js";
import { grep } from "../../../util/grep.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import { runByRepository } from "../../helpers.js";

export async function categorizeResourceByResolution(
    resources: Resource[],
): Promise<{ resolved: Resource[]; unresolved: Resource[]; deletionConflicts: Resource[] }> {
    const selection: Resource[] = resources.filter(s => s instanceof Resource);
    const merge = selection.filter(s => s.state.resourceGroupType === ResourceGroupType.Merge);
    const isBothAddedOrModified = (s: Resource): boolean =>
        s.state.type === Status.BOTH_MODIFIED || s.state.type === Status.BOTH_ADDED;
    const isAnyDeleted = (s: Resource): boolean =>
        s.state.type === Status.DELETED_BY_THEM || s.state.type === Status.DELETED_BY_US;
    const possibleUnresolved = merge.filter(isBothAddedOrModified);
    const promises = possibleUnresolved.map(s => grep(s.state.resourceUri.fsPath, /^<{7}|^={7}|^>{7}/));
    const unresolvedBothModified = await Promise.all<boolean>(promises);
    const resolved = possibleUnresolved.filter((_s, i) => !unresolvedBothModified[i]);
    const deletionConflicts = merge.filter(s => isAnyDeleted(s));
    const unresolved = [
        ...merge.filter(s => !isBothAddedOrModified(s) && !isAnyDeleted(s)),
        ...possibleUnresolved.filter((_s, i) => unresolvedBothModified[i]),
    ];

    return { deletionConflicts, resolved, unresolved };
}

/**
 * Confirms staging `unresolved` conflicts, then runs `stageDeletionConflicts`.
 * Resolves to false when the user backs out of either, before anything else is staged.
 */
export async function stageConflicts(
    unresolved: Resource[],
    stageDeletionConflicts: () => Promise<void>,
): Promise<boolean> {
    if (unresolved.length > 0) {
        const message = i18n.Translations.confirmStageWithMergeConflicts(unresolved);
        const yes = i18n.Translations.yes();
        const pick = await window.showWarningMessage(message, { modal: true }, yes);

        if (pick !== yes) {
            return false;
        }
    }

    try {
        await stageDeletionConflicts();
    } catch (err) {
        // `runByRepository` aggregates each repository's failure.
        const errors = err instanceof AggregateError ? err.errors : [err];
        if (errors.every(isCancelledError)) {
            return false;
        }

        throw err;
    }

    return true;
}

export async function stageDeletionConflict(repository: AbstractRepository, uri: Uri): Promise<void> {
    const uriString = uri.toString();
    const resource =
        repository.sourceControlUI.mergeGroup.resourceStates.get().filter(r =>
            r.state.resourceUri.toString() === uriString
        )[0];

    if (!resource) {
        return;
    }

    if (resource.state.type === Status.DELETED_BY_THEM) {
        const keepIt = i18n.Translations.keepOurs();
        const deleteIt = i18n.Translations.allowDeletion();
        const result = await window.showInformationMessage(
            i18n.Translations.stageDeletedByThem(uri),
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
    } else if (resource.state.type === Status.DELETED_BY_US) {
        const keepIt = i18n.Translations.keepTheirs();
        const deleteIt = i18n.Translations.allowDeletion();
        const result = await window.showInformationMessage(
            i18n.Translations.stageDeletedByUs(uri),
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

export async function stageChanges(
    model: Model,
    originalDocument: TextDocument,
    modifiedDocument: TextDocument,
    changes: ILineChange[],
): Promise<void> {
    const modifiedUri = modifiedDocument.uri;

    if (modifiedUri.scheme !== "file") {
        throw new Error("Invalid scheme");
    }

    const result = applyLineChanges(originalDocument, modifiedDocument, changes);

    await runByRepository(
        model,
        [modifiedUri],
        async (repository, resources) => {
            for (const resource of resources) {
                await repository.stage(resource, result);
            }
        },
    );
}

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
