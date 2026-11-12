import type { Model } from "../../model.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand<"close"> {
    function close(repository: AbstractRepository): void {
        model.close(repository);
    }

    return {
        commandId: makeCommandId("close"),
        method: close,
        options: {
            repository: true,
        },
    };
}
