import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { sync as syncFn } from "./helper.js";

export async function sync(repository: AbstractRepository): Promise<void> {
    try {
        await syncFn(repository, false);
    } catch (err) {
        if (isCancelledError(err)) {
            return;
        }

        throw err;
    }
}

export function createCommand(): ScmCommand {
    async function syncFn(repository: AbstractRepository): Promise<void> {
        await sync(repository);
    }

    return {
        commandId: makeCommandId("sync"),
        method: syncFn,
        options: {
            repository: true,
        },
    };
}
