import { Status } from "../../../api/git.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { cleanUntrackedChange, cleanUntrackedChanges } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function cleanAllUntracked(repository: AbstractRepository): Promise<void> {
        const resources = [
            ...repository.sourceControlUI.trackedGroup.resourceStates.get(),
            ...repository.sourceControlUI.untrackedGroup.resourceStates.get(),
        ]
            .filter(r => r.state.type === Status.UNTRACKED || r.state.type === Status.IGNORED);

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
        commandId: "git.cleanAllUntracked",
        method: cleanAllUntracked,
        options: {
            repository: true,
        },
    };
}
