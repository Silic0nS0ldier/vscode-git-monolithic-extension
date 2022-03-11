import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function rebaseAbort(repository: AbstractRepository): Promise<void> {
        if (repository.rebaseCommit) {
            await repository.rebaseAbort();
        } else {
            await window.showInformationMessage(localize("no rebase", "No rebase in progress."));
        }
    }

    return {
        commandId: "git.rebaseAbort",
        method: rebaseAbort,
        options: {
            repository: true,
        },
    };
}
