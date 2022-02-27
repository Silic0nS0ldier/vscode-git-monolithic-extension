import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { sync as syncFn } from "./helper.js";

export async function sync(repository: FinalRepository, model: Model): Promise<void> {
    try {
        await syncFn(repository, false, model);
    } catch (err) {
        if (/Cancelled/i.test(err && (err.message || err.stderr || ""))) {
            return;
        }

        throw err;
    }
}

export function createCommand(model: Model): ScmCommand {
    async function syncFn(repository: FinalRepository): Promise<void> {
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
