import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushToForce(
        repository: FinalRepository,
        remote?: string,
        refspec?: string,
        setUpstream?: boolean,
    ): Promise<void> {
        await push(
            repository,
            {
                pushType: PushType.PushTo,
                pushTo: {
                    remote,
                    refspec,
                    setUpstream,
                },
                forcePush: true,
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
