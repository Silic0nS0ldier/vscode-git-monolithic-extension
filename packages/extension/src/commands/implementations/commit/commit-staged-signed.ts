import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedSigned(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, signoff: true });
    }

    return {
        commandId: "git.commitStagedSigned",
        method: commitStagedSigned,
        options: {
            repository: true,
        },
    };
}
