import { window } from "vscode";
import { FinalRepository } from "../../repository/repository-class/mod.js";
import { localize } from "../../util.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function cherryPick(repository: FinalRepository): Promise<void> {
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
