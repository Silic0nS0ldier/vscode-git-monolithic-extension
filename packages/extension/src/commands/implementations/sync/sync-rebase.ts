import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { sync } from "./helper.js";

export function createCommand(model: Model): ScmCommand {
    async function syncRebase(repository: AbstractRepository): Promise<void> {
        try {
            await sync(repository, true, model);
        } catch (err) {
            if (/Cancelled/i.test(err && (err.message || err.stderr || ""))) {
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
