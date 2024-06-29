import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function unstageAll(repository: AbstractRepository): Promise<void> {
        await repository.revert([]);
    }

    return {
        commandId: "git.unstageAll",
        method: unstageAll,
        options: {
            repository: true,
        },
    };
}
