import { Status } from "../../../api/git.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllTracked(repository: FinalRepository): Promise<void> {
        const resources = repository.workingTreeGroup.resourceStates
            .filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);
        const uris = resources.map(r => r.resourceUri);

        await repository.add(uris);
    }

    return {
        commandId: "git.stageAllTracked",
        method: stageAllTracked,
        options: {
            repository: true,
        },
    };
}
