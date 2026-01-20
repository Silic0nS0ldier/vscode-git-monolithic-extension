import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitStagedAmendNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: false, amend: true, noVerify: true });
    }

    return {
        commandId: makeCommandId("commitStagedAmendNoVerify"),
        method: commitStagedAmendNoVerify,
        options: {
            repository: true,
        },
    };
}
