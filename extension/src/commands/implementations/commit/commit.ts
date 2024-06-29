import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commit(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model);
    }

    return {
        commandId: "git.commit",
        method: commit,
        options: {
            repository: true,
        },
    };
}
