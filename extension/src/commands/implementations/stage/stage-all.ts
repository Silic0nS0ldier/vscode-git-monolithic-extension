import { Uri } from "vscode";
import { Status } from "../../../api/git.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAll(repository: AbstractRepository): Promise<void> {
        const mixed = config.untrackedChanges(Uri.file(repository.root)) === "mixed";
        const tracked = repository.sourceControlUI.trackedGroup.resourceStates.get();
        // `-u` rejects any path git does not already track, so only `mixed` may name untracked files.
        const resources = mixed
            ? [...tracked, ...repository.sourceControlUI.untrackedGroup.resourceStates.get()]
            : tracked.filter(r => r.state.type !== Status.UNTRACKED && r.state.type !== Status.IGNORED);
        const uris = resources.map(r => r.state.resourceUri);

        if (uris.length > 0) {
            await repository.add(uris, mixed ? undefined : { update: true });
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
