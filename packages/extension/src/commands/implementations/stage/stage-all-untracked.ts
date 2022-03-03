import { Status } from "../../../api/git.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllUntracked(repository: AbstractRepository): Promise<void> {
        const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates]
            .filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);
        const uris = resources.map(r => r.resourceUri);

        await repository.add(uris);
    }

    return {
        commandId: "git.stageAllUntracked",
        method: stageAllUntracked,
        options: {
            repository: true,
        },
    };
}
