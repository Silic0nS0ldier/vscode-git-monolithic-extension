import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function fetchAll(repository: AbstractRepository): Promise<void> {
        if (repository.remotes.length === 0) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToFetch(),
            );
            return;
        }

        await repository.fetchAll();
    }

    return {
        commandId: makeCommandId("fetchAll"),
        method: fetchAll,
        options: {
            repository: true,
        },
    };
}
