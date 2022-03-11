import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushToForce(
        repository: AbstractRepository,
        remote?: string,
        refspec?: string,
        setUpstream?: boolean,
    ): Promise<void> {
        await push(
            repository,
            {
                forcePush: true,
                pushTo: {
                    refspec,
                    remote,
                    setUpstream,
                },
                pushType: PushType.PushTo,
            },
            model,
        );
    }

    return {
        commandId: "git.pushToForce",
        method: pushToForce,
        options: {
            repository: true,
        },
    };
}
