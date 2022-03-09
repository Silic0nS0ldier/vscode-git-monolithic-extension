import { Uri, workspace } from "vscode";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function stageAll(repository: AbstractRepository): Promise<void> {
        const resources = [...repository.sourceControlUI.trackedGroup.resourceStates, ...repository.sourceControlUI.untrackedGroup.resourceStates];
        const uris = resources.map(r => r.resourceUri);

        if (uris.length > 0) {
            const config = workspace.getConfiguration("git", Uri.file(repository.root));
            const untrackedChanges = config.get<"mixed" | "separate" | "hidden">("untrackedChanges");
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
