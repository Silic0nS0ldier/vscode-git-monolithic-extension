import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function refresh(repository: AbstractRepository): Promise<void> {
        await repository.status();
    }

    return {
        commandId: makeCommandId("refresh"),
        method: refresh,
        options: {
            repository: true,
        },
    };
}
