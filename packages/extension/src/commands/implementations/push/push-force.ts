import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushForce(repository: FinalRepository): Promise<void> {
        await push(repository, { pushType: PushType.Push, forcePush: true }, model);
    }

    return {
        commandId: "git.pushForce",
        method: pushForce,
        options: {
            repository: true,
        },
    };
}
