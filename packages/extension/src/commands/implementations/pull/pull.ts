import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function pull(repository: AbstractRepository): Promise<void> {
        const remotes = repository.remotes;

        if (remotes.length === 0) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToPull(),
            );
            return;
        }

        await repository.pull(repository.HEAD);
    }

    return {
        commandId: "git.pull",
        method: pull,
        options: {
            repository: true,
        },
    };
}
