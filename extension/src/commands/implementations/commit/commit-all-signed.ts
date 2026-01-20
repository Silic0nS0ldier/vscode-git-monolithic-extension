import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitAllSigned(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: true, signoff: true });
    }

    return {
        commandId: makeCommandId("commitAllSigned"),
        method: commitAllSigned,
        options: {
            repository: true,
        },
    };
}
