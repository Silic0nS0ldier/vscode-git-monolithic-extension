import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllAmendNoVerify(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, amend: true, noVerify: true });
    }

    return {
        commandId: "git.commitAllAmendNoVerify",
        method: commitAllAmendNoVerify,
        options: {
            repository: true,
        },
    };
}
