import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitStagedAmend(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: false, amend: true });
    }

    return {
        commandId: makeCommandId("commitStagedAmend"),
        method: commitStagedAmend,
        options: {
            repository: true,
        },
    };
}
