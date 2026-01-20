import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitAllAmend(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: true, amend: true });
    }

    return {
        commandId: makeCommandId("commitAllAmend"),
        method: commitAllAmend,
        options: {
            repository: true,
        },
    };
}
