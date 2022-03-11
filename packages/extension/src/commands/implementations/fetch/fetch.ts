import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function fetch(repository: AbstractRepository): Promise<void> {
        if (repository.remotes.length === 0) {
            window.showWarningMessage(
                localize("no remotes to fetch", "This repository has no remotes configured to fetch from."),
            );
            return;
        }

        await repository.fetchDefault();
    }

    return {
        commandId: "git.fetch",
        method: fetch,
        options: {
            repository: true,
        },
    };
}
