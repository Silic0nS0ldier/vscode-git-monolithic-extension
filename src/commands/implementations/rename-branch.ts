import { window } from "vscode";
import { GitErrorCodes } from "../../api/git.js";
import { ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";
import { localize } from "../../util.js";

export function createCommand(
	promptForBranchName: (defaultName?: string, initialValue?: string) => Promise<string>,
): ScmCommand {
	async function renameBranch(repository: Repository): Promise<void> {
		const currentBranchName = repository.HEAD && repository.HEAD.name;
		const branchName = await promptForBranchName(undefined, currentBranchName);

		if (!branchName) {
			return;
		}

		try {
			await repository.renameBranch(branchName);
		} catch (err) {
			switch (err.gitErrorCode) {
				case GitErrorCodes.InvalidBranchName:
					window.showErrorMessage(localize('invalid branch name', 'Invalid branch name'));
					return;
				case GitErrorCodes.BranchAlreadyExists:
					window.showErrorMessage(localize('branch already exists', "A branch named '{0}' already exists", branchName));
					return;
				default:
					throw err;
			}
		}
	};

	return {
		commandId: 'git.renameBranch',
		method: renameBranch,
		options: {
			repository: true,
		},
	};
}

