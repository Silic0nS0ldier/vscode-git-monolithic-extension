import { FinalRepository } from "../../repository/repository-class/mod.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function restoreCommitTemplate(repository: FinalRepository): Promise<void> {
        repository.inputBox.value = await repository.getCommitTemplate();
    }

    return {
        commandId: "git.restoreCommitTemplate",
        method: restoreCommitTemplate,
        options: {
            repository: true,
        },
    };
}
