import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function commitAllSignedNoVerify(repository: AbstractRepository): Promise<void> {
        await commitWithAnyInput(repository, { all: true, noVerify: true, signoff: true });
    }

    return {
        commandId: makeCommandId("commitAllSignedNoVerify"),
        method: commitAllSignedNoVerify,
        options: {
            repository: true,
        },
    };
}
