import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStagedAmend(repository: Repository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false, amend: true });
    }

    return {
        commandId: "git.commitStagedAmend",
        method: commitStagedAmend,
        options: {
            repository: true,
        },
    };
}
