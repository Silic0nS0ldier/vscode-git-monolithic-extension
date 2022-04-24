import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";
import { pickStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashApply(repository: AbstractRepository): Promise<void> {
        const placeHolder = i18n.Translations.pickStashToApply();
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
