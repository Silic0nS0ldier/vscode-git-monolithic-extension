import { Uri, window } from "vscode";
import * as os from 'node:os';
import { ScmCommand } from "../commands.js";
import { Model } from "../model.js";
import { localize } from "../util.js";

export function createCommand(
	model: Model,
): ScmCommand {
	async function openRepository(path?: string): Promise<void> {
		if (!path) {
			const result = await window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: Uri.file(os.homedir()),
				openLabel: localize('open repo', "Open Repository")
			});

			if (!result || result.length === 0) {
				return;
			}

			path = result[0].fsPath;
		}

		await model.openRepository(path);
	};

	return {
		commandId: 'git.openRepository',
		method: openRepository,
		options: {
			repository: false,
		},
	};
}

