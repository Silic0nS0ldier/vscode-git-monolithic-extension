import { Uri, window } from "vscode";
import * as path from "node:path";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(): ScmCommand {
	async function rename(repository: Repository, fromUri: Uri | undefined): Promise<void> {
		fromUri = fromUri ?? window.activeTextEditor?.document.uri;

		if (!fromUri) {
			return;
		}

		const from = path.relative(repository.root, fromUri.fsPath);
		let to = await window.showInputBox({
			value: from,
			valueSelection: [from.length - path.basename(from).length, from.length]
		});

		to = to?.trim();

		if (!to) {
			return;
		}

		await repository.move(from, to);
	};

	return {
		commandId: 'git.rename',
		method: rename,
		options: {
			repository: true,
		},
	};
}

