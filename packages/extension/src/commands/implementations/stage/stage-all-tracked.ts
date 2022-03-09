import { Status } from "../../../api/git.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllTracked(repository: AbstractRepository): Promise<void> {
        const resources = repository.sourceControlUI.trackedGroup.resourceStates.get()
            .filter(r => r.state.type !== Status.UNTRACKED && r.state.type !== Status.IGNORED);
        const uris = resources.map(r => r.state.resourceUri);

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
