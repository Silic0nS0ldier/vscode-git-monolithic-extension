import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAll(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true });
    }

    return {
        commandId: "git.commitAll",
        method: commitAll,
        options: {
            repository: true,
        },
    };
}
