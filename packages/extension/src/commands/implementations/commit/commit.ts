import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commit(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model);
    }

    return {
        commandId: "git.commit",
        method: commit,
        options: {
            repository: true,
        },
    };
}
