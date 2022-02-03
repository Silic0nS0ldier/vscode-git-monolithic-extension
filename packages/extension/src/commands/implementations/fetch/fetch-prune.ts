import { window } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function fetchPrune(repository: Repository): Promise<void> {
        if (repository.remotes.length === 0) {
            window.showWarningMessage(
                localize("no remotes to fetch", "This repository has no remotes configured to fetch from."),
            );
            return;
        }

        await repository.fetchPrune();
    }

    return {
        commandId: "git.fetchPrune",
        method: fetchPrune,
        options: {
            repository: true,
        },
    };
}
