import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";

export async function stashPopLatest(repository: AbstractRepository): Promise<void> {
    const stashes = await repository.getStashes();

    if (stashes.length === 0) {
        window.showInformationMessage(localize("no stashes", "There are no stashes in the repository."));
        return;
    }

    await repository.popStash();
}

export function createCommand(): ScmCommand {
    return {
        commandId: "git.stashPopLatest",
        method: stashPopLatest,
        options: {
            repository: true,
        },
    };
}
