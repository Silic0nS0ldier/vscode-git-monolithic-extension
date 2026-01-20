import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commit(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository);
    }

    return {
        commandId: makeCommandId("commit"),
        method: commit,
        options: {
            repository: true,
        },
    };
}
