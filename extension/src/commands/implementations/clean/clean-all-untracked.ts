import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { getUntrackedResources, makeCommandId, type ScmCommand } from "../../helpers.js";
import { cleanUntrackedChange, cleanUntrackedChanges } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function cleanAllUntracked(repository: AbstractRepository): Promise<void> {
        const resources = getUntrackedResources(repository);

        if (resources.length === 0) {
            return;
        }

        if (resources.length === 1) {
            await cleanUntrackedChange(repository, resources[0]);
        } else {
            await cleanUntrackedChanges(repository, resources);
        }
    }

    return {
        commandId: makeCommandId("cleanAllUntracked"),
        method: cleanAllUntracked,
        options: {
            repository: true,
        },
    };
}
