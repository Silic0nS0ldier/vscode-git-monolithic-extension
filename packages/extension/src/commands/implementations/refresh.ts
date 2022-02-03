import { Repository } from "../../repository.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function refresh(repository: Repository): Promise<void> {
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
