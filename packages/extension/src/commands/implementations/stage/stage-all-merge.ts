import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import * as i18n from "../../../i18n/mod.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
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
            if (isCancelledError(err)) {
                return;
            }

            throw err;
        }

        if (unresolved.length > 0) {
            const message = i18n.Translations.confirmStageWithMergeConflicts(merge);

            const yes = i18n.Translations.yes();
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
