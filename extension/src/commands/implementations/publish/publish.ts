import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export async function publish(repository: AbstractRepository): Promise<void> {
    const branchName = repository.HEAD && repository.HEAD.name || "";
    const remotes = repository.remotes;

    {
        const [firstRemote, ...otherRemotes] = remotes;
        if (!firstRemote) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToPublish(),
            );
            return;
        }

        if (otherRemotes.length === 0) {
            await repository.pushTo(firstRemote.name, branchName, true);
            return;
        }
    }

    const remoteNames = remotes.map((remote) => remote.name);
    const selected = await window.showQuickPick(remoteNames, {
        placeHolder: i18n.Translations.selectRemoteToPublish(),
    });

    if (selected) {
        await repository.pushTo(selected, branchName, true);
    }
}

export function createCommand(): ScmCommand {
    async function publishFn(repository: AbstractRepository): Promise<void> {
        await publish(repository);
    }

    return {
        commandId: makeCommandId("publish"),
        method: publishFn,
        options: {
            repository: true,
        },
    };
}
