import { Uri } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAll(repository: AbstractRepository): Promise<void> {
        const resources = [
            ...repository.sourceControlUI.trackedGroup.resourceStates.get(),
            ...repository.sourceControlUI.untrackedGroup.resourceStates.get(),
        ];
        const uris = resources.map(r => r.state.resourceUri);

        if (uris.length > 0) {
            const untrackedChanges = config.untrackedChanges(Uri.file(repository.root));
            await repository.add(uris, untrackedChanges === "mixed" ? undefined : { update: true });
        }
    }

    return {
        commandId: "git.stageAll",
        method: stageAll,
        options: {
            repository: true,
        },
    };
}
