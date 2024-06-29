import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    function stashWithoutUntracked(repository: AbstractRepository): Promise<void> {
        return createStash(repository);
    }

    return {
        commandId: "git.stash",
        method: stashWithoutUntracked,
        options: {
            repository: true,
        },
    };
}
