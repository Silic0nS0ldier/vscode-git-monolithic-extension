import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { branch } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function branchFrom(repository: AbstractRepository): Promise<void> {
        await branch(repository, undefined, true);
    }

    return {
        commandId: makeCommandId("branchFrom"),
        method: branchFrom,
        options: {
            repository: true,
        },
    };
}
