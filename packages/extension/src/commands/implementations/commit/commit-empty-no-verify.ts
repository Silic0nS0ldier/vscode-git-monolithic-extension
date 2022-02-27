import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitEmpty } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitEmptyNoVerify(repository: FinalRepository): Promise<void> {
        await commitEmpty(repository, model, true);
    }

    return {
        commandId: "git.commitEmptyNoVerify",
        method: commitEmptyNoVerify,
        options: {
            repository: true,
        },
    };
}
