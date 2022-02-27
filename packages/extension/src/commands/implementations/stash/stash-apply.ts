import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashApply(repository: FinalRepository): Promise<void> {
        const placeHolder = localize("pick stash to apply", "Pick a stash to apply");
        const stash = await pickStash(repository, placeHolder);

        if (!stash) {
            return;
        }

        await repository.applyStash(stash.index);
    }

    return {
        commandId: "git.stashApply",
        method: stashApply,
        options: {
            repository: true,
        },
    };
}
