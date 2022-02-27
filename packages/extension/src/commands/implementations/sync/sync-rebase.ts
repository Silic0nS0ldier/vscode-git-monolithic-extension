import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { sync } from "./helper.js";

export function createCommand(model: Model): ScmCommand {
    async function syncRebase(repository: FinalRepository): Promise<void> {
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
