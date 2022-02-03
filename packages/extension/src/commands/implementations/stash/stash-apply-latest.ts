import { window } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stashApplyLatest(repository: Repository): Promise<void> {
        const stashes = await repository.getStashes();

        if (stashes.length === 0) {
            window.showInformationMessage(localize("no stashes", "There are no stashes in the repository."));
            return;
        }

        await repository.applyStash();
    }

    return {
        commandId: "git.stashApplyLatest",
        method: stashApplyLatest,
        options: {
            repository: true,
        },
    };
}
