import { window } from "vscode";
import { sanitizeRemoteName, ScmCommand } from "../../commands.js";
import { Model } from "../../model.js";
import { pickRemoteSource } from "../../remoteSource.js";
import { Repository } from "../../repository.js";
import { localize } from "../../util.js";

export async function addRemoteCmdImpl(
	model: Model,
	repository: Repository,
): Promise<string|void> {
	const url = await pickRemoteSource(model, {
		providerLabel: provider => localize('addfrom', "Add remote from {0}", provider.name),
		urlLabel: localize('addFrom', "Add remote from URL")
	});

	if (!url) {
		return;
	}

	const resultName = await window.showInputBox({
		placeHolder: localize('remote name', "Remote name"),
		prompt: localize('provide remote name', "Please provide a remote name"),
		ignoreFocusOut: true,
		validateInput: (name: string) => {
			if (!sanitizeRemoteName(name)) {
				return localize('remote name format invalid', "Remote name format invalid");
			} else if (repository.remotes.find(r => r.name === name)) {
				return localize('remote already exists', "Remote '{0}' already exists.", name);
			}

			return null;
		}
	});

	const name = sanitizeRemoteName(resultName || '');

	if (!name) {
		return;
	}

	await repository.addRemote(name, url.trim());
	await repository.fetch({ remote: name });
	return name;
}

export function createCommand(
	model: Model,
): ScmCommand {
	async function addRemote(repository: Repository): Promise<string|void> {
		await addRemoteCmdImpl(model, repository);
	};

	return {
		commandId: 'git.addRemote',
		method: addRemote,
		options: {
			repository: true,
		},
	};
}

