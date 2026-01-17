import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllAmendNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, amend: true, noVerify: true });
    }

    return {
        commandId: makeCommandId("commitAllAmendNoVerify"),
        method: commitAllAmendNoVerify,
        options: {
            repository: true,
        },
    };
}
