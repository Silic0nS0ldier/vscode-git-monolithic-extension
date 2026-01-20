import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitEmptyFn(repository: AbstractRepository): Promise<void> {
        await commitEmpty(repository);
    }

    return {
        commandId: makeCommandId("commitEmpty"),
        method: commitEmptyFn,
        options: {
            repository: true,
        },
    };
}
