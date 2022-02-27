import { commands } from "vscode";
import { Status } from "../../../../api/git.js";
import { FinalRepository } from "../../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../../helpers.js";

export function createCommand(): ScmCommand {
    async function openAllChanges(repository: FinalRepository): Promise<void> {
        for (
            const resource of [
                ...repository.workingTreeGroup.resourceStates,
                ...repository.untrackedGroup.resourceStates,
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
