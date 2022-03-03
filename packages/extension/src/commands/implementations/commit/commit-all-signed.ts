import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllSigned(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, signoff: true });
    }

    return {
        commandId: "git.commitAllSigned",
        method: commitAllSigned,
        options: {
            repository: true,
        },
    };
}
