import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedAmendNoVerify(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, amend: true, noVerify: true });
    }

    return {
        commandId: "git.commitStagedAmendNoVerify",
        method: commitStagedAmendNoVerify,
        options: {
            repository: true,
        },
    };
}
