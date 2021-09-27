import { window } from "vscode";
import { ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";
import { localize } from "../util.js";

export function createCommand(): ScmCommand {
	async function createTag(repository: Repository): Promise<void> {
		const inputTagName = await window.showInputBox({
			placeHolder: localize('tag name', "Tag name"),
			prompt: localize('provide tag name', "Please provide a tag name"),
			ignoreFocusOut: true
		});

		if (!inputTagName) {
			return;
		}

		const inputMessage = await window.showInputBox({
			placeHolder: localize('tag message', "Message"),
			prompt: localize('provide tag message', "Please provide a message to annotate the tag"),
			ignoreFocusOut: true
		});

		const name = inputTagName.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, '-');
		await repository.tag(name, inputMessage);
	};

	return {
		commandId: 'git.createTag',
		method: createTag,
		options: {
			repository: true,
		},
	};
}

