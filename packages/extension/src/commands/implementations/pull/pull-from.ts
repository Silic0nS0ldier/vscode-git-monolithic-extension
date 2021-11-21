import { window } from "vscode";
import { ScmCommand } from "../../helpers.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export function createCommand(): ScmCommand {
	async function pullFrom(repository: Repository): Promise<void> {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		const remotePicks = remotes.filter(r => r.fetchUrl !== undefined).map(r => ({ label: r.name, description: r.fetchUrl! }));
		const placeHolder = localize('pick remote pull repo', "Pick a remote to pull the branch from");
		const remotePick = await window.showQuickPick(remotePicks, { placeHolder });

		if (!remotePick) {
			return;
		}

		const remoteRefs = repository.refs;
		const remoteRefsFiltered = remoteRefs.filter(r => (r.remote === remotePick.label));
		const branchPicks = remoteRefsFiltered.map(r => ({ label: r.name! }));
		const branchPlaceHolder = localize('pick branch pull', "Pick a branch to pull from");
		const branchPick = await window.showQuickPick(branchPicks, { placeHolder: branchPlaceHolder });

		if (!branchPick) {
			return;
		}

		const remoteCharCnt = remotePick.label.length;

		await repository.pullFrom(false, remotePick.label, branchPick.label.slice(remoteCharCnt + 1));
	};

	return {
		commandId: 'git.pullFrom',
		method: pullFrom,
		options: {
			repository: true,
		},
	};
}

