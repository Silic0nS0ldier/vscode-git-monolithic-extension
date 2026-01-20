import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function pushForce(repository: AbstractRepository): Promise<void> {
        await push(repository, { forcePush: true, pushType: PushType.Push });
    }

    return {
        commandId: makeCommandId("pushForce"),
        method: pushForce,
        options: {
            repository: true,
        },
    };
}
