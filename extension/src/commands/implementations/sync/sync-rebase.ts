import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { sync } from "./helper.js";

export function createCommand(): ScmCommand {
    async function syncRebase(repository: AbstractRepository): Promise<void> {
        try {
            await sync(repository, true);
        } catch (err) {
            if (isCancelledError(err)) {
                return;
            }

            throw err;
        }
    }

    return {
        commandId: makeCommandId("syncRebase"),
        method: syncRebase,
        options: {
            repository: true,
        },
    };
}
