import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { push as pushFn, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function push(repository: Repository): Promise<void> {
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
