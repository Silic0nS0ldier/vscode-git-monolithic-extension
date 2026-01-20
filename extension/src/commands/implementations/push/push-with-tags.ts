import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function pushWithTags(repository: AbstractRepository): Promise<void> {
        await push(repository, { pushType: PushType.PushFollowTags });
    }

    return {
        commandId: makeCommandId("pushWithTags"),
        method: pushWithTags,
        options: {
            repository: true,
        },
    };
}
