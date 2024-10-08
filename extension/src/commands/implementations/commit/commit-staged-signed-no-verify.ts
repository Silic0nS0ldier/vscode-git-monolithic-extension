import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedSignedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, noVerify: true, signoff: true });
    }

    return {
        commandId: "git.commitStagedSignedNoVerify",
        method: commitStagedSignedNoVerify,
        options: {
            repository: true,
        },
    };
}
