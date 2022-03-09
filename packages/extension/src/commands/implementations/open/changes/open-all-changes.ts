import { commands } from "vscode";
import { Status } from "../../../../api/git.js";
import { AbstractRepository } from "../../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../../helpers.js";

export function createCommand(): ScmCommand {
    async function openAllChanges(repository: AbstractRepository): Promise<void> {
        for (
            const resource of [
                ...repository.sourceControlUI.trackedGroup.resourceStates,
                ...repository.sourceControlUI.untrackedGroup.resourceStates,
            ]
        ) {
            if (
                resource.type === Status.DELETED || resource.type === Status.DELETED_BY_THEM
                || resource.type === Status.DELETED_BY_US || resource.type === Status.BOTH_DELETED
            ) {
                continue;
            }

            commands.executeCommand(
                "vscode.open",
                resource.resourceUri,
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
