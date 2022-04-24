import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function fetchPrune(repository: AbstractRepository): Promise<void> {
        if (repository.remotes.length === 0) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToFetch(),
            );
            return;
        }

        await repository.fetchPrune();
    }

    return {
        commandId: "git.fetchPrune",
        method: fetchPrune,
        options: {
            repository: true,
        },
    };
}
