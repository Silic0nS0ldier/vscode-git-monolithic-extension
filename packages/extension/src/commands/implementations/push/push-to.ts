import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function pushTo(
        repository: Repository,
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
