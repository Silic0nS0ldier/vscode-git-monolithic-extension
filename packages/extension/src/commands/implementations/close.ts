import type { Model } from "../../model.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function close(repository: AbstractRepository): Promise<void> {
        model.close(repository);
    }

    return {
        commandId: "git.close",
        method: close,
        options: {
            repository: true,
        },
    };
}
