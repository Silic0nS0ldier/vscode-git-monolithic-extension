import { commands } from "vscode";
import { Status } from "../../../../api/git.js";
import { AbstractRepository } from "../../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../../helpers.js";

export function createCommand(): ScmCommand {
    async function openAllChanges(repository: AbstractRepository): Promise<void> {
        for (
            const resource of [
                ...repository.sourceControlUI.trackedGroup.resourceStates.get(),
                ...repository.sourceControlUI.untrackedGroup.resourceStates.get(),
            ]
        ) {
            if (
                resource.state.type === Status.DELETED || resource.state.type === Status.DELETED_BY_THEM
                || resource.state.type === Status.DELETED_BY_US || resource.state.type === Status.BOTH_DELETED
            ) {
                continue;
            }

            commands.executeCommand(
                "vscode.open",
                resource.state.resourceUri,
                { background: true, preview: false },
            );
        }
    }

    return {
        commandId: "git.openAllChanges",
        method: openAllChanges,
        options: {
            repository: true,
        },
    };
}
