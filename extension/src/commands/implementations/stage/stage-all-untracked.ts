import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { getUntrackedResources, makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllUntracked(repository: AbstractRepository): Promise<void> {
        const uris = getUntrackedResources(repository).map(r => r.state.resourceUri);

        await repository.add(uris);
    }

    return {
        commandId: makeCommandId("stageAllUntracked"),
        method: stageAllUntracked,
        options: {
            repository: true,
        },
    };
}
