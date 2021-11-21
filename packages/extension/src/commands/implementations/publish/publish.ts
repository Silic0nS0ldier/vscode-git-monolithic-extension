import { window } from "vscode";
import { ApiRepository } from "../../../api/api1.js";
import { RemoteSourceProvider } from "../../../api/git.js";
import { ScmCommand } from "../../../commands.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";
import { AddRemoteItem } from "./quick-pick.js";

export async function publish(
	model: Model,
	addRemoteFn: (repository: Repository) => Promise<string|void>,
	repository: Repository,
) {
	const branchName = repository.HEAD && repository.HEAD.name || '';
	const remotes = repository.remotes;

	if (remotes.length === 0) {
		const providers = model.getRemoteProviders().filter(p => !!p.publishRepository);

		if (providers.length === 0) {
			window.showWarningMessage(localize('no remotes to publish', "Your repository has no remotes configured to publish to."));
			return;
		}

		let provider: RemoteSourceProvider;

		if (providers.length === 1) {
			provider = providers[0];
		} else {
			const picks = providers
				.map(provider => ({ label: (provider.icon ? `$(${provider.icon}) ` : '') + localize('publish to', "Publish to {0}", provider.name), alwaysShow: true, provider }));
			const placeHolder = localize('pick provider', "Pick a provider to publish the branch '{0}' to:", branchName);
			const choice = await window.showQuickPick(picks, { placeHolder });

			if (!choice) {
				return;
			}

			provider = choice.provider;
		}

		await provider.publishRepository!(new ApiRepository(repository));
		model.firePublishEvent(repository, branchName);

		return;
	}

	if (remotes.length === 1) {
		await repository.pushTo(remotes[0].name, branchName, true);
		model.firePublishEvent(repository, branchName);

		return;
	}

	const addRemote = new AddRemoteItem(addRemoteFn);
	const picks = [...repository.remotes.map(r => ({ label: r.name, description: r.pushUrl })), addRemote];
	const placeHolder = localize('pick remote', "Pick a remote to publish the branch '{0}' to:", branchName);
	const choice = await window.showQuickPick(picks, { placeHolder });

	if (!choice) {
		return;
	}

	if (choice === addRemote) {
		const newRemote = await addRemoteFn(repository);

		if (newRemote) {
			await repository.pushTo(newRemote, branchName, true);

			model.firePublishEvent(repository, branchName);
		}
	} else {
		await repository.pushTo(choice.label, branchName, true);

		model.firePublishEvent(repository, branchName);
	}
}

export function createCommand(
	model: Model,
	addRemoteFn: (repository: Repository) => Promise<string|void>,
): ScmCommand {
	async function publishFn(repository: Repository): Promise<void> {
		await publish(model, addRemoteFn, repository);
	};

	return {
		commandId: 'git.publish',
		method: publishFn,
		options: {
			repository: true,
		},
	};
}
