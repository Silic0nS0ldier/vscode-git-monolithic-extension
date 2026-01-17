import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function unstageAll(repository: AbstractRepository): Promise<void> {
        await repository.revert([]);
    }

    return {
        commandId: makeCommandId("unstageAll"),
        method: unstageAll,
        options: {
            repository: true,
        },
    };
}
