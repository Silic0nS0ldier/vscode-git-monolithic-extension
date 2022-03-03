import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushWithTags(repository: AbstractRepository): Promise<void> {
        await push(repository, { pushType: PushType.PushFollowTags }, model);
    }

    return {
        commandId: "git.pushWithTags",
        method: pushWithTags,
        options: {
            repository: true,
        },
    };
}
