import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function removeRemote(repository: AbstractRepository): Promise<string | void> {
        const remotes = repository.remotes;

        if (remotes.length === 0) {
            window.showErrorMessage(localize("no remotes added", "Your repository has no remotes."));
            return;
        }

        const picks = remotes.map(r => r.name);
        const placeHolder = localize("remove remote", "Pick a remote to remove");

        const remoteName = await window.showQuickPick(picks, { placeHolder });

        if (!remoteName) {
            return;
        }

        await repository.removeRemote(remoteName);
    }

    return {
        commandId: "git.removeRemote",
        method: removeRemote,
        options: {
            repository: true,
        },
    };
}
