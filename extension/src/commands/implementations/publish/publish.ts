import { window } from "vscode";
import { ApiRepository } from "../../../api/api1.js";
import type { RemoteSourceProvider } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { addRemote as addRemoteFn } from "../remote/add-remote.js";
import { AddRemoteItem } from "./quick-pick.js";

export async function publish(model: Model, repository: AbstractRepository): Promise<void> {
    const branchName = repository.HEAD && repository.HEAD.name || "";
    const remotes = repository.remotes;

    if (remotes.length === 0) {
        const providers = model.getRemoteProviders().filter(p => !!p.publishRepository);

        if (providers.length === 0) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToPublish(),
            );
            return;
        }

        let provider: RemoteSourceProvider;

        if (providers.length === 1) {
            provider = providers[0];
        } else {
            const picks = providers
                .map(provider => ({
                    alwaysShow: true,
                    label: (provider.icon ? `$(${provider.icon}) ` : "")
                        + i18n.Translations.publishTo(provider.name),
                    provider,
                }));
            const placeHolder = i18n.Translations.pickRemote(branchName);
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

    const addRemote = new AddRemoteItem(repository => addRemoteFn(model, repository));
    const picks = [...repository.remotes.map(r => ({ description: r.pushUrl, label: r.name })), addRemote];
    const placeHolder = i18n.Translations.pickRemote(branchName);
    const choice = await window.showQuickPick(picks, { placeHolder });

    if (!choice) {
        return;
    }

    if (choice === addRemote) {
        const newRemote = await addRemoteFn(model, repository);

        if (newRemote) {
            await repository.pushTo(newRemote, branchName, true);

            model.firePublishEvent(repository, branchName);
        }
    } else {
        await repository.pushTo(choice.label, branchName, true);

        model.firePublishEvent(repository, branchName);
    }
}

export function createCommand(model: Model): ScmCommand {
    async function publishFn(repository: AbstractRepository): Promise<void> {
        await publish(model, repository);
    }

    return {
        commandId: makeCommandId("publish"),
        method: publishFn,
        options: {
            repository: true,
        },
    };
}
