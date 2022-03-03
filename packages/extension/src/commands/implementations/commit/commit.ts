import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
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
