import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitEmptyFn(repository: AbstractRepository): Promise<void> {
        await commitEmpty(repository, model);
    }

    return {
        commandId: "git.commitEmpty",
        method: commitEmptyFn,
        options: {
            repository: true,
        },
    };
}
