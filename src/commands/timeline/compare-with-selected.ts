// import { commands, Uri } from "vscode";
// import * as path from "node:path";
// import { ScmCommand } from "../../commands.js";
// import { GitTimelineItem } from '../../timelineProvider.js';
// import { toGitUri } from "../../uri.js";
// import { localize } from "../../util.js";

// export function createCommand(
// 	_: {
// 		selectedForCompare: { uri: Uri, item: GitTimelineItem } | undefined
// 	},
// ): ScmCommand {
// 	async function compareWithSelected(item: TimelineItem, uri: Uri | undefined, _source: string): Promise<void> {
// 		if (!GitTimelineItem.is(item) || !uri || !_.selectedForCompare || uri.toString() !== _.selectedForCompare.uri.toString()) {
// 			return;
// 		}

// 		const { item: selected } = _.selectedForCompare;

// 		const basename = path.basename(uri.fsPath);
// 		let leftTitle;
// 		if ((selected.previousRef === 'HEAD' || selected.previousRef === '~') && selected.ref === '') {
// 			leftTitle = localize('git.title.workingTree', '{0} (Working Tree)', basename);
// 		}
// 		else if (selected.previousRef === 'HEAD' && selected.ref === '~') {
// 			leftTitle = localize('git.title.index', '{0} (Index)', basename);
// 		} else {
// 			leftTitle = localize('git.title.ref', '{0} ({1})', basename, selected.shortRef);
// 		}

// 		let rightTitle;
// 		if ((item.previousRef === 'HEAD' || item.previousRef === '~') && item.ref === '') {
// 			rightTitle = localize('git.title.workingTree', '{0} (Working Tree)', basename);
// 		}
// 		else if (item.previousRef === 'HEAD' && item.ref === '~') {
// 			rightTitle = localize('git.title.index', '{0} (Index)', basename);
// 		} else {
// 			rightTitle = localize('git.title.ref', '{0} ({1})', basename, item.shortRef);
// 		}


// 		const title = localize('git.title.diff', '{0} ⟷ {1}', leftTitle, rightTitle);
// 		await commands.executeCommand('vscode.diff', selected.ref === '' ? uri : toGitUri(uri, selected.ref), item.ref === '' ? uri : toGitUri(uri, item.ref), title);
// 	};

// 	return {
// 		commandId: 'git.timeline.compareWithSelected',
// 		method: compareWithSelected,
// 		options: {
// 			repository: false,
// 		},
// 	};
// }
