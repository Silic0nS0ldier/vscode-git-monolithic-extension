import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import type { ScmCommand } from "../../helpers.js";
import { sync } from "./helper.js";

export function createCommand(model: Model): ScmCommand {
    async function syncRebase(repository: AbstractRepository): Promise<void> {
        try {
            await sync(repository, true, model);
        } catch (err) {
            if (isCancelledError(err)) {
                return;
            }

            throw err;
        }
    }

    return {
        commandId: "git.syncRebase",
        method: syncRebase,
        options: {
            repository: true,
        },
    };
}
