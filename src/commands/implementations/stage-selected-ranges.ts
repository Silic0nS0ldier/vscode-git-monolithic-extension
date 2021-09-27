// import { TextEditor, window } from "vscode";
// import { ScmCommand } from "../../commands.js";
// import { intersectDiffWithRange, toLineRanges } from "../../staging.js";

// export function createCommand(
// 	stageChanges: (textEditor: TextEditor, changes: LineChange[]) => Promise<void>,
// ): ScmCommand {
// 	async function stageSelectedRanges(changes: LineChange[]): Promise<void> {
// 		const textEditor = window.activeTextEditor;

// 		if (!textEditor) {
// 			return;
// 		}

// 		const modifiedDocument = textEditor.document;
// 		const selectedLines = toLineRanges(textEditor.selections, modifiedDocument);
// 		const selectedChanges = changes
// 			.map(diff => selectedLines.reduce<LineChange | null>((result, range) => result || intersectDiffWithRange(modifiedDocument, diff, range), null))
// 			.filter(d => !!d) as LineChange[];

// 		if (!selectedChanges.length) {
// 			return;
// 		}

// 		await stageChanges(textEditor, selectedChanges);
// 	};

// 	return {
// 		commandId: 'git.stageSelectedRanges',
// 		method: stageSelectedRanges,
// 		options: {
// 			diff: true,
// 		},
// 	};
// }

