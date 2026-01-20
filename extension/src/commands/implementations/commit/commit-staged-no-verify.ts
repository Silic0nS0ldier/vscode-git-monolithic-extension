import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitStagedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: false, noVerify: true });
    }

    return {
        commandId: makeCommandId("commitStagedNoVerify"),
        method: commitStagedNoVerify,
        options: {
            repository: true,
        },
    };
}
