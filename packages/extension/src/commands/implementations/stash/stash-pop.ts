import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashPop(repository: AbstractRepository): Promise<void> {
        const placeHolder = localize("pick stash to pop", "Pick a stash to pop");
        const stash = await pickStash(repository, placeHolder);

        if (!stash) {
            return;
        }

        await repository.popStash(stash.index);
    }

    return {
        commandId: "git.stashPop",
        method: stashPop,
        options: {
            repository: true,
        },
    };
}
