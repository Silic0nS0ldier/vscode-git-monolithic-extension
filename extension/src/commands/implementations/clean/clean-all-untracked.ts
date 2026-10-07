import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { getUntrackedResources, makeCommandId, type ScmCommand } from "../../helpers.js";
import { cleanUntrackedChanges } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function cleanAllUntracked(repository: AbstractRepository): Promise<void> {
        const resources = getUntrackedResources(repository);

        if (resources.length === 0) {
            return;
        }

        await cleanUntrackedChanges(repository, resources);
    }

    return {
        commandId: makeCommandId("cleanAllUntracked"),
        method: cleanAllUntracked,
        options: {
            repository: true,
        },
    };
}
