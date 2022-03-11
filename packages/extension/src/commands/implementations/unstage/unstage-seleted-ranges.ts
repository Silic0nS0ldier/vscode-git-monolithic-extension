export {};
// import { window, workspace } from "vscode";
// import { RunByRepository, ScmCommand } from "../../commands.js";
// import { applyLineChanges, intersectDiffWithRange, invertLineChange, toLineRanges } from "../../staging.js";
// import { fromGitUri, isGitUri, toGitUri } from "../../uri.js";

// export function createCommand(
// 	runByRepository: RunByRepository<void>,
// ): ScmCommand {
// 	async function unstageSelectedRanges(diffs: LineChange[]): Promise<void> {
// 		const textEditor = window.activeTextEditor;

// 		if (!textEditor) {
// 			return;
// 		}

// 		const modifiedDocument = textEditor.document;
// 		const modifiedUri = modifiedDocument.uri;

// 		if (!isGitUri(modifiedUri)) {
// 			return;
// 		}

// 		const { ref } = fromGitUri(modifiedUri);

// 		if (ref !== '') {
// 			return;
// 		}

// 		const originalUri = toGitUri(modifiedUri, 'HEAD');
// 		const originalDocument = await workspace.openTextDocument(originalUri);
// 		const selectedLines = toLineRanges(textEditor.selections, modifiedDocument);
// 		const selectedDiffs = diffs
// 			.map(diff => selectedLines.reduce<LineChange | null>((result, range) => result || intersectDiffWithRange(modifiedDocument, diff, range), null))
// 			.filter(d => !!d) as LineChange[];

// 		if (!selectedDiffs.length) {
// 			return;
// 		}

// 		const invertedDiffs = selectedDiffs.map(invertLineChange);
// 		const result = applyLineChanges(modifiedDocument, originalDocument, invertedDiffs);

// 		await runByRepository(
// 			[modifiedUri],
// 			async (repository, resources) => {
// 				for (const resource of resources) {
// 					await repository.stage(resource, result);
// 				}
// 			});
// 	};

// 	return {
// 		commandId: 'git.unstageSelectedRanges',
// 		method: unstageSelectedRanges,
// 		options: {
// 			diff: true,
// 		},
// 	};
// }
