import { window } from "vscode";
import * as i18n from "../../i18n/mod.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function cherryPick(repository: AbstractRepository): Promise<void> {
        const hash = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: i18n.Translations.commitHash(),
            prompt: i18n.Translations.provideCommitHash(),
        });

        if (!hash) {
            return;
        }

        await repository.cherryPick(hash);
    }

    return {
        commandId: "git.cherryPick",
        method: cherryPick,
        options: {
            repository: true,
        },
    };
}
