import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function restoreCommitTemplate(repository: AbstractRepository): Promise<void> {
        repository.sourceControlUI.sourceControl.inputBox.value = await repository.getCommitTemplate();
    }

    return {
        commandId: makeCommandId("restoreCommitTemplate"),
        method: restoreCommitTemplate,
        options: {
            repository: true,
        },
    };
}
