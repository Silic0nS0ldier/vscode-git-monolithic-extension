import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushWithTagsForce(repository: FinalRepository): Promise<void> {
        await push(repository, { forcePush: true, pushType: PushType.PushFollowTags }, model);
    }

    return {
        commandId: "git.pushWithTagsForce",
        method: pushWithTagsForce,
        options: {
            repository: true,
        },
    };
}
