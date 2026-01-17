import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllSignedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, noVerify: true, signoff: true });
    }

    return {
        commandId: makeCommandId("commitAllSignedNoVerify"),
        method: commitAllSignedNoVerify,
        options: {
            repository: true,
        },
    };
}
