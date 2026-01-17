import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function rebaseAbort(repository: AbstractRepository): Promise<void> {
        if (repository.rebaseCommit) {
            await repository.rebaseAbort();
        } else {
            await window.showInformationMessage(i18n.Translations.noRebase());
        }
    }

    return {
        commandId: makeCommandId("rebaseAbort"),
        method: rebaseAbort,
        options: {
            repository: true,
        },
    };
}
