import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashIncludeUntracked(repository: AbstractRepository): Promise<void> {
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
