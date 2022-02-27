import { Model } from "../../model.js";
import { FinalRepository } from "../../repository/repository-class/mod.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function close(repository: FinalRepository): Promise<void> {
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
