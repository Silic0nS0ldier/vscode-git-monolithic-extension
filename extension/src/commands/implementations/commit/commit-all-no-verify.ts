import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitAllNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: true, noVerify: true });
    }

    return {
        commandId: makeCommandId("commitAllNoVerify"),
        method: commitAllNoVerify,
        options: {
            repository: true,
        },
    };
}
