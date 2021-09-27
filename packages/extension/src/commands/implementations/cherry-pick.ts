import { window } from "vscode";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";
import { localize } from "../../util.js";

export function createCommand(): ScmCommand {
	async function cherryPick(repository: Repository): Promise<void> {
		const hash = await window.showInputBox({
			placeHolder: localize('commit hash', "Commit Hash"),
			prompt: localize('provide commit hash', "Please provide the commit hash"),
			ignoreFocusOut: true
		});

		if (!hash) {
			return;
		}

		await repository.cherryPick(hash);
	};

	return {
		commandId: 'git.cherryPick',
		method: cherryPick,
		options: {
			repository: true,
		},
	};
}

