import { Status } from "../../../api/git.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { cleanTrackedChanges } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function cleanAllTracked(repository: AbstractRepository): Promise<void> {
        const resources = repository.sourceControlUI.trackedGroup.resourceStates.get()
            .filter(r => r.state.type !== Status.UNTRACKED && r.state.type !== Status.IGNORED);

        if (resources.length === 0) {
            return;
        }

        await cleanTrackedChanges(repository, resources);
    }

    return {
        commandId: "git.cleanAllTracked",
        method: cleanAllTracked,
        options: {
            repository: true,
        },
    };
}
