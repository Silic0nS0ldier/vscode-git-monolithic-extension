import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitStaged(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: false });
    }

    return {
        commandId: makeCommandId("commitStaged"),
        method: commitStaged,
        options: {
            repository: true,
        },
    };
}
