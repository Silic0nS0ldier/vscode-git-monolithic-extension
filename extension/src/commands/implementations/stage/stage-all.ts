import { Uri } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAll(repository: AbstractRepository): Promise<void> {
        const resources = [
            ...repository.sourceControlUI.trackedGroup.resourceStates.get(),
            ...repository.sourceControlUI.untrackedGroup.resourceStates.get(),
        ];
        const uris = resources.map(r => r.state.resourceUri);

        if (uris.length > 0) {
            const untrackedChanges = config.untrackedChanges(Uri.file(repository.root));
            // TODO Outside `mixed` this names untracked files alongside `-u`, which git rejects as
            //      unknown pathspecs; leave the untracked group out there, as upstream does.
            await repository.add(uris, untrackedChanges === "mixed" ? undefined : { update: true });
        }
    }

    return {
        commandId: makeCommandId("stageAll"),
        method: stageAll,
        options: {
            repository: true,
        },
    };
}
