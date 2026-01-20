import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { push, PushType } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function pushTo(
        repository: AbstractRepository,
        remote?: string,
        refspec?: string,
        setUpstream?: boolean,
    ): Promise<void> {
        await push(repository, {
            pushTo: {
                refspec,
                remote,
                setUpstream,
            },
            pushType: PushType.PushTo,
        });
    }

    return {
        commandId: makeCommandId("pushTo"),
        method: pushTo,
        options: {
            repository: true,
        },
    };
}
