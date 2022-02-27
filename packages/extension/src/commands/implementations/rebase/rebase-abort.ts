import { window } from "vscode";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function rebaseAbort(repository: FinalRepository): Promise<void> {
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
