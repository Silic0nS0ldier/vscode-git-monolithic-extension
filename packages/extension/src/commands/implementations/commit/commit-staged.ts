import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitStaged(repository: FinalRepository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: false });
    }

    return {
        commandId: "git.commitStaged",
        method: commitStaged,
        options: {
            repository: true,
        },
    };
}
