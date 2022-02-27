import { window } from "vscode";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function pull(repository: FinalRepository): Promise<void> {
        const remotes = repository.remotes;

        if (remotes.length === 0) {
            window.showWarningMessage(
                localize("no remotes to pull", "Your repository has no remotes configured to pull from."),
            );
            return;
        }

        await repository.pull(repository.HEAD);
    }

    return {
        commandId: "git.pull",
        method: pull,
        options: {
            repository: true,
        },
    };
}
