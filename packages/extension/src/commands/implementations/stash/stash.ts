import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { createStash } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stashWithoutUntracked(repository: FinalRepository) {
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
