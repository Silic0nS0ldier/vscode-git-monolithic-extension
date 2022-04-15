import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import type { ScmCommand } from "../../helpers.js";
import { sync as syncFn } from "./helper.js";

export async function sync(repository: AbstractRepository, model: Model): Promise<void> {
    try {
        await syncFn(repository, false, model);
    } catch (err) {
        if (isCancelledError(err)) {
            return;
        }

        throw err;
    }
}

export function createCommand(model: Model): ScmCommand {
    async function syncFn(repository: AbstractRepository): Promise<void> {
        await sync(repository, model);
    }

    return {
        commandId: "git.sync",
        method: syncFn,
        options: {
            repository: true,
        },
    };
}
