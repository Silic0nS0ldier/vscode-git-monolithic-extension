import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushTags(repository: AbstractRepository): Promise<void> {
        await push(repository, { pushType: PushType.PushTags }, model);
    }

    return {
        commandId: makeCommandId("pushTags"),
        method: pushTags,
        options: {
            repository: true,
        },
    };
}
