import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashDrop(repository: AbstractRepository): Promise<void> {
        const placeHolder = i18n.Translations.pickStashToDrop();
        const stash = await pickStash(repository, placeHolder);

        if (!stash) {
            return;
        }

        // request confirmation for the operation
        const yes = i18n.Translations.yes();
        const result = await window.showWarningMessage(
            i18n.Translations.sureDropStash(stash.description),
            yes,
        );
        if (result !== yes) {
            return;
        }

        await repository.dropStash(stash.index);
    }

    return {
        commandId: "git.stashDrop",
        method: stashDrop,
        options: {
            repository: true,
        },
    };
}
