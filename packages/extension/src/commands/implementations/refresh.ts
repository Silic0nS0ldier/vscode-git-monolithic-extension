import { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function refresh(repository: AbstractRepository): Promise<void> {
        await repository.status();
    }

    return {
        commandId: "git.refresh",
        method: refresh,
        options: {
            repository: true,
        },
    };
}
