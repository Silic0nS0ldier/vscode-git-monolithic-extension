import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllSignedNoVerify(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, signoff: true, noVerify: true });
    }

    return {
        commandId: "git.commitAllSignedNoVerify",
        method: commitAllSignedNoVerify,
        options: {
            repository: true,
        },
    };
}
