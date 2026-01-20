import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitAll(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: true });
    }

    return {
        commandId: makeCommandId("commitAll"),
        method: commitAll,
        options: {
            repository: true,
        },
    };
}
