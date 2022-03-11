import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashWithoutUntracked(repository: AbstractRepository) {
        await createStash(repository);
    }

    return {
        commandId: "git.stash",
        method: stashWithoutUntracked,
        options: {
            repository: true,
        },
    };
}
