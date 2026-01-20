import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(): ScmCommand {
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
        );
    }

    return {
        commandId: makeCommandId("pushToForce"),
        method: pushToForce,
        options: {
            repository: true,
        },
    };
}
