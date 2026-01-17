import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitEmptyNoVerify(repository: AbstractRepository): Promise<void> {
        await commitEmpty(repository, model, true);
    }

    return {
        commandId: makeCommandId("commitEmptyNoVerify"),
        method: commitEmptyNoVerify,
        options: {
            repository: true,
        },
    };
}
