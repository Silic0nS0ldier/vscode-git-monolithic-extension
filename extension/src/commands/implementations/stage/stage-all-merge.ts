import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { categorizeResourceByResolution, stageConflicts, stageDeletionConflict } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllMerge(repository: AbstractRepository): Promise<void> {
        const resources = repository.sourceControlUI.mergeGroup.resourceStates.get().filter(s =>
            s instanceof Resource
        ) as Resource[];
        const { resolved, unresolved, deletionConflicts } = await categorizeResourceByResolution(resources);

        const proceed = await stageConflicts(unresolved, async () => {
            for (const deletionConflict of deletionConflicts) {
                await stageDeletionConflict(repository, deletionConflict.state.resourceUri);
            }
        });

        if (!proceed) {
            return;
        }

        const uris = [...resolved, ...unresolved].map(r => r.state.resourceUri);

        if (uris.length > 0) {
            await repository.add(uris);
        }
    }

    return {
        commandId: makeCommandId("stageAllMerge"),
        method: stageAllMerge,
        options: {
            repository: true,
        },
    };
}
