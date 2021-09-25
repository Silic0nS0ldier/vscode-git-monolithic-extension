// import { Command, commands, TextDocumentShowOptions, Uri, ViewColumn } from "vscode";
// import { ScmCommand } from "../../commands.js";

// export function createCommand(
// 	resolveTimelineOpenDiffCommand: (item: TimelineItem, uri: Uri | undefined, options?: TextDocumentShowOptions) => Command | undefined
// ): ScmCommand {
// 	async function openDiff(item: TimelineItem, uri: Uri | undefined, _source: string): Promise<void> {
// 		const cmd = resolveTimelineOpenDiffCommand(
// 			item, uri,
// 			{
// 				preserveFocus: true,
// 				preview: true,
// 				viewColumn: ViewColumn.Active
// 			},
// 		);
// 		if (cmd === undefined) {
// 			return undefined;
// 		}

// 		return commands.executeCommand(cmd.command, ...(cmd.arguments ?? []));
// 	};

// 	return {
// 		commandId: 'git.timeline.openDiff',
// 		key: openDiff.name,
// 		method: openDiff,
// 		options: {
// 			repository: false,
// 		},
// 	};
// }
