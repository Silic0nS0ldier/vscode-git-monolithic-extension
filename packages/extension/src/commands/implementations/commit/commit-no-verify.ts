import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitNoVerify(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { noVerify: true });
    }

    return {
        commandId: "git.commitNoVerify",
        method: commitNoVerify,
        options: {
            repository: true,
        },
    };
}
