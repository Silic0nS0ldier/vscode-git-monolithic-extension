import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashPop(repository: AbstractRepository): Promise<void> {
        const placeHolder = i18n.Translations.pickStashToPop();
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
