import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushToForce(
        repository: Repository,
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
