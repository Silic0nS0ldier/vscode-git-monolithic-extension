export {};
// import { TextEditor, window } from "vscode";
// import { ScmCommand } from "../helpers.js";
// import { getModifiedRange } from "../../staging.js";

// export function createCommand(
// 	revertChanges: (textEditor: TextEditor, changes: LineChange[]) => Promise<void>,
// ): ScmCommand {
// 	async function revertSelectedRanges(changes: LineChange[]): Promise<void> {
// 		const textEditor = window.activeTextEditor;

// 		if (!textEditor) {
// 			return;
// 		}

// 		const modifiedDocument = textEditor.document;
// 		const selections = textEditor.selections;
// 		const selectedChanges = changes.filter(change => {
// 			const modifiedRange = getModifiedRange(modifiedDocument, change);
// 			return selections.every(selection => !selection.intersection(modifiedRange));
// 		});

// 		if (selectedChanges.length === changes.length) {
// 			return;
// 		}

// 		const selectionsBeforeRevert = textEditor.selections;
// 		await revertChanges(textEditor, selectedChanges);
// 		textEditor.selections = selectionsBeforeRevert;
// 	};

// 	return {
// 		commandId: 'git.revertSelectedRanges',
// 		method: revertSelectedRanges,
// 		options: {
// 			diff: true,
// 		},
// 	};
// }
