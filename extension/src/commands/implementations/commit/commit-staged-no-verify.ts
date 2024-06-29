import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, noVerify: true });
    }

    return {
        commandId: "git.commitStagedNoVerify",
        method: commitStagedNoVerify,
        options: {
            repository: true,
        },
    };
}
