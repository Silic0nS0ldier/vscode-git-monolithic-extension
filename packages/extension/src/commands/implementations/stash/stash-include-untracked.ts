import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashIncludeUntracked(repository: FinalRepository): Promise<void> {
        await createStash(repository, true);
    }

    return {
        commandId: "git.stashIncludeUntracked",
        method: stashIncludeUntracked,
        options: {
            repository: true,
        },
    };
}
