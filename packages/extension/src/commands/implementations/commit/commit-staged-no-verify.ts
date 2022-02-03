import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedNoVerify(repository: Repository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, noVerify: true });
    }

    return {
        commandId: "git.commitStagedNoVerify",
        method: commitStagedNoVerify,
        options: {
            repository: true,
        },
    };
}
