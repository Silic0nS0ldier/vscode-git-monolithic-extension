export {};
// import { Selection, TextEditor, Uri, window } from "vscode";
// import { ScmCommand } from "../helpers.js";

// export function createCommand(
// 	stageChanges: (textEditor: TextEditor, changes: LineChange[]) => Promise<void>,
// ): ScmCommand {
// 	async function stageChange(uri: Uri, changes: LineChange[], index: number): Promise<void> {
// 		if (!uri) {
// 			return;
// 		}

// 		const textEditor = window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString())[0];

// 		if (!textEditor) {
// 			return;
// 		}

// 		await stageChanges(textEditor, [changes[index]]);

// 		const firstStagedLine = changes[index].modifiedStartLineNumber - 1;
// 		textEditor.selections = [new Selection(firstStagedLine, 0, firstStagedLine, 0)];
// 	};

// 	return {
// 		commandId: 'git.stageChange',
// 		method: stageChange,
// 		options: {},
// 	};
// }
