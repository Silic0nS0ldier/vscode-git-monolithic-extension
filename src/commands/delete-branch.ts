import { window } from "vscode";
import { GitErrorCodes, RefType } from "../api/git.js";
import { BranchDeleteItem, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(): ScmCommand {
	async function deleteBranch(repository: Repository, name: string, force?: boolean): Promise<void> {
		let run: (force?: boolean) => Promise<void>;
		if (typeof name === 'string') {
			run = force => repository.deleteBranch(name, force);
		} else {
			const currentHead = repository.HEAD && repository.HEAD.name;
			const heads = repository.refs.filter(ref => ref.type === RefType.Head && ref.name !== currentHead)
				.map(ref => new BranchDeleteItem(ref));

			const placeHolder = localize('select branch to delete', 'Select a branch to delete');
			const choice = await window.showQuickPick<BranchDeleteItem>(heads, { placeHolder });

			if (!choice || !choice.branchName) {
				return;
			}
			name = choice.branchName;
			run = force => choice.run(repository, force);
		}

		try {
			await run(force);
		} catch (err) {
			if (err.gitErrorCode !== GitErrorCodes.BranchNotFullyMerged) {
				throw err;
			}

			const message = localize('confirm force delete branch', "The branch '{0}' is not fully merged. Delete anyway?", name);
			const yes = localize('delete branch', "Delete Branch");
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick === yes) {
				await run(true);
			}
		}
	};

	return {
		commandId: 'git.deleteBranch',
		method: deleteBranch,
		options: {
			repository: true,
		},
	};
}

