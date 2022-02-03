import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function unstageAll(repository: Repository): Promise<void> {
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
