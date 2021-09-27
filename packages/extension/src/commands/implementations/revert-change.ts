// import { Selection, TextEditor, Uri, window } from "vscode";
// import { ScmCommand } from "../../commands.js";

// export function createCommand(
// 	revertChanges: (textEditor: TextEditor, changes: LineChange[]) => Promise<void>,
// ): ScmCommand {
// 	async function revertChange(uri: Uri, changes: LineChange[], index: number): Promise<void> {
// 		if (!uri) {
// 			return;
// 		}

// 		const textEditor = window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString())[0];

// 		if (!textEditor) {
// 			return;
// 		}

// 		await revertChanges(textEditor, [...changes.slice(0, index), ...changes.slice(index + 1)]);

// 		const firstStagedLine = changes[index].modifiedStartLineNumber - 1;
// 		textEditor.selections = [new Selection(firstStagedLine, 0, firstStagedLine, 0)];
// 	};

// 	return {
// 		commandId: 'git.revertChange',
// 		method: revertChange,
// 		options: {},
// 	};
// }

