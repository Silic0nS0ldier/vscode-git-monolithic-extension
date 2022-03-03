import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllAmend(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, amend: true });
    }

    return {
        commandId: "git.commitAllAmend",
        method: commitAllAmend,
        options: {
            repository: true,
        },
    };
}
