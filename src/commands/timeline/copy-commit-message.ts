// import { env, Uri } from "vscode";
// import { ScmCommand } from "../../commands.js";
// import { GitTimelineItem } from '../../timelineProvider.js';

// export function createCommand(): ScmCommand {
// 	async function copyCommitMessage(item: TimelineItem, uri: Uri | undefined, _source: string): Promise<void> {
// 		if (!GitTimelineItem.is(item)) {
// 			return;
// 		}

// 		env.clipboard.writeText(item.message);
// 	};

// 	return {
// 		commandId: 'git.timeline.copyCommitMessage',
// 		key: copyCommitMessage.name,
// 		method: copyCommitMessage,
// 		options: {
// 			repository: false,
// 		},
// 	};
// }
