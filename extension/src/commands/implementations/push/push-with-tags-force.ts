import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushWithTagsForce(repository: AbstractRepository): Promise<void> {
        await push(repository, { forcePush: true, pushType: PushType.PushFollowTags }, model);
    }

    return {
        commandId: makeCommandId("pushWithTagsForce"),
        method: pushWithTagsForce,
        options: {
            repository: true,
        },
    };
}
