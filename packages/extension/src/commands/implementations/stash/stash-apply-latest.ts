import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stashApplyLatest(repository: AbstractRepository): Promise<void> {
        const stashes = await repository.getStashes();

        if (stashes.length === 0) {
            window.showInformationMessage(i18n.Translations.noStashes());
            return;
        }

        await repository.applyStash();
    }

    return {
        commandId: "git.stashApplyLatest",
        method: stashApplyLatest,
        options: {
            repository: true,
        },
    };
}
