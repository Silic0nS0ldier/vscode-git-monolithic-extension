import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitStagedSignedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: false, noVerify: true, signoff: true });
    }

    return {
        commandId: makeCommandId("commitStagedSignedNoVerify"),
        method: commitStagedSignedNoVerify,
        options: {
            repository: true,
        },
    };
}
