import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { noVerify: true });
    }

    return {
        commandId: "git.commitNoVerify",
        method: commitNoVerify,
        options: {
            repository: true,
        },
    };
}
