import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function unstageAll(repository: FinalRepository): Promise<void> {
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
