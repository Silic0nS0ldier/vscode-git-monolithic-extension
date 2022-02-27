import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushTo(
        repository: FinalRepository,
        remote?: string,
        refspec?: string,
        setUpstream?: boolean,
    ): Promise<void> {
        await push(repository, {
            pushType: PushType.PushTo,
            pushTo: {
                remote,
                refspec,
                setUpstream,
            },
        }, model);
    }

    return {
        commandId: "git.pushTo",
        method: pushTo,
        options: {
            repository: true,
        },
    };
}
