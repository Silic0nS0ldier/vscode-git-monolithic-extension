import { Model } from "../../../model.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";
import { push as pushFn, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function push(repository: AbstractRepository): Promise<void> {
        await pushFn(repository, { pushType: PushType.Push }, model);
    }

    return {
        commandId: "git.push",
        method: push,
        options: {
            repository: true,
        },
    };
}
