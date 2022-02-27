import { FinalRepository } from "../../repository/repository-class/mod.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function refresh(repository: FinalRepository): Promise<void> {
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
