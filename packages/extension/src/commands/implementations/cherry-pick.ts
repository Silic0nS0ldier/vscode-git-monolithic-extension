import { window } from "vscode";
import { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../util.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function cherryPick(repository: AbstractRepository): Promise<void> {
        const hash = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: localize("commit hash", "Commit Hash"),
            prompt: localize("provide commit hash", "Please provide the commit hash"),
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
