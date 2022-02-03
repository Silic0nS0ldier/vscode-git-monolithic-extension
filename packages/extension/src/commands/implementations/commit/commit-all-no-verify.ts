import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { ScmCommand } from "../../helpers.js";
import { commitWithAnyInput } from "./helpers.js";

export function createCommand(model: Model): ScmCommand {
    async function commitAllNoVerify(repository: Repository): Promise<void> {
        await commitWithAnyInput(repository, model, { all: true, noVerify: true });
    }

    return {
        commandId: "git.commitAllNoVerify",
        method: commitAllNoVerify,
        options: {
            repository: true,
        },
    };
}
