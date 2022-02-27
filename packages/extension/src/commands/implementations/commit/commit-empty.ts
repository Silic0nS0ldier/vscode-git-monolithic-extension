import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitEmptyFn(repository: FinalRepository): Promise<void> {
        await commitEmpty(repository, model);
    }

    return {
        commandId: "git.commitEmpty",
        method: commitEmptyFn,
        options: {
            repository: true,
        },
    };
}
