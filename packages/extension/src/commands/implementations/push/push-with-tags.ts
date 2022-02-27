import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushWithTags(repository: FinalRepository): Promise<void> {
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
