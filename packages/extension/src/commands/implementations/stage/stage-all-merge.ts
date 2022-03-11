import * as path from "node:path";
import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import { localize } from "../../../util.js";
import type { ScmCommand } from "../../helpers.js";
import { categorizeResourceByResolution, stageDeletionConflict } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function stageAllMerge(repository: AbstractRepository): Promise<void> {
        const resources = repository.sourceControlUI.mergeGroup.resourceStates.get().filter(s =>
            s instanceof Resource
        ) as Resource[];
        const { merge, unresolved, deletionConflicts } = await categorizeResourceByResolution(resources);

        try {
            for (const deletionConflict of deletionConflicts) {
                await stageDeletionConflict(repository, deletionConflict.state.resourceUri);
            }
        } catch (err) {
            if (/Cancelled/.test(err.message)) {
                return;
            }

            throw err;
        }

        if (unresolved.length > 0) {
            const message = unresolved.length > 1
                ? localize(
                    "confirm stage files with merge conflicts",
                    "Are you sure you want to stage {0} files with merge conflicts?",
                    merge.length,
                )
                : localize(
                    "confirm stage file with merge conflicts",
                    "Are you sure you want to stage {0} with merge conflicts?",
                    path.basename(merge[0].state.resourceUri.fsPath),
                );

            const yes = localize("yes", "Yes");
            const pick = await window.showWarningMessage(message, { modal: true }, yes);

            if (pick !== yes) {
                return;
            }
        }

        const uris = resources.map(r => r.state.resourceUri);

        if (uris.length > 0) {
            await repository.add(uris);
        }
    }

    return {
        commandId: "git.stageAllMerge",
        method: stageAllMerge,
        options: {
            repository: true,
        },
    };
}
