import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashDrop(repository: AbstractRepository): Promise<void> {
        const placeHolder = localize("pick stash to drop", "Pick a stash to drop");
        const stash = await pickStash(repository, placeHolder);

        if (!stash) {
            return;
        }

        // request confirmation for the operation
        const yes = localize("yes", "Yes");
        const result = await window.showWarningMessage(
            localize("sure drop", "Are you sure you want to drop the stash: {0}?", stash.description),
            yes,
        );
        if (result !== yes) {
            return;
        }

        await repository.dropStash(stash.index);
    }

    return {
        commandId: "git.stashDrop",
        method: stashDrop,
        options: {
            repository: true,
        },
    };
}
