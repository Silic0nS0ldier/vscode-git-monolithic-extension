// import { commands, Uri } from "vscode";
// import { ScmCommand } from "../../commands.js";
// import { GitTimelineItem } from '../../timelineProvider.js';

// export function createCommand(
// 	_: {
// 		selectedForCompare: { uri: Uri, item: GitTimelineItem } | undefined
// 	},
// ): ScmCommand {
// 	async function selectForCompare(item: TimelineItem, uri: Uri | undefined, _source: string): Promise<void> {
// 		if (!GitTimelineItem.is(item) || !uri) {
// 			return;
// 		}

// 		_.selectedForCompare = { uri, item };
// 		await commands.executeCommand('setContext', 'git.timeline.selectedForCompare', true);
// 	};

// 	return {
// 		commandId: 'git.timeline.selectForCompare',
// 		method: selectForCompare,
// 		options: {
// 			repository: false,
// 		},
// 	};
// }
