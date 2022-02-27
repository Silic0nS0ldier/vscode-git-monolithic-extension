import { Status } from "../../../api/git.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { cleanTrackedChanges } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function cleanAllTracked(repository: FinalRepository): Promise<void> {
        const resources = repository.workingTreeGroup.resourceStates
            .filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);

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
