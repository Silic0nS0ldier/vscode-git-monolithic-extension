import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { noVerify: true });
    }

    return {
        commandId: makeCommandId("commitNoVerify"),
        method: commitNoVerify,
        options: {
            repository: true,
        },
    };
}
