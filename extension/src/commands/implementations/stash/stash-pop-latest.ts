import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export async function stashPopLatest(repository: AbstractRepository): Promise<void> {
    const stashes = await repository.getStashes();

    if (stashes.length === 0) {
        window.showInformationMessage(i18n.Translations.noStashes());
        return;
    }

    await repository.popStash();
}

export function createCommand(): ScmCommand {
    return {
        commandId: makeCommandId("stashPopLatest"),
        method: stashPopLatest,
        options: {
            repository: true,
        },
    };
}
