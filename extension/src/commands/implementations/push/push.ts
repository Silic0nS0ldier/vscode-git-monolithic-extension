import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push as pushFn, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function push(repository: AbstractRepository): Promise<void> {
        await pushFn(repository, { pushType: PushType.Push }, model);
    }

    return {
        commandId: makeCommandId("push"),
        method: push,
        options: {
            repository: true,
        },
    };
}
