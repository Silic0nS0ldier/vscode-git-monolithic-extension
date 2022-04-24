import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function removeRemote(repository: AbstractRepository): Promise<string | void> {
        const remotes = repository.remotes;

        if (remotes.length === 0) {
            window.showErrorMessage(i18n.Translations.noRemotesAdded());
            return;
        }

        const picks = remotes.map(r => r.name);
        const placeHolder = i18n.Translations.removeRemote();

        const remoteName = await window.showQuickPick(picks, { placeHolder });

        if (!remoteName) {
            return;
        }

        await repository.removeRemote(remoteName);
    }

    return {
        commandId: "git.removeRemote",
        method: removeRemote,
        options: {
            repository: true,
        },
    };
}
