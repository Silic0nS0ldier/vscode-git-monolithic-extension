import { window } from "vscode";
import { Status } from "../../../api/git.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";
import { cleanTrackedChanges, cleanUntrackedChange, cleanUntrackedChanges } from "./helpers.js";

export async function cleanAll(repository: AbstractRepository): Promise<void> {
    let resources = repository.sourceControlUI.trackedGroup.resourceStates.get();

    if (resources.length === 0) {
        return;
    }

    const trackedResources = resources.filter(r =>
        r.state.type !== Status.UNTRACKED && r.state.type !== Status.IGNORED
    );
    const untrackedResources = resources.filter(r =>
        r.state.type === Status.UNTRACKED || r.state.type === Status.IGNORED
    );

    if (untrackedResources.length === 0) {
        await cleanTrackedChanges(repository, resources);
    } else if (resources.length === 1) {
        await cleanUntrackedChange(repository, resources[0]);
    } else if (trackedResources.length === 0) {
        await cleanUntrackedChanges(repository, resources);
    } else { // resources.length > 1 && untrackedResources.length > 0 && trackedResources.length > 0
        const untrackedMessage = i18n.Translations.warnUntracked2(untrackedResources);

        const message = i18n.Translations.confirmDiscard2(
            untrackedMessage,
            resources,
        );

        const yesTracked = i18n.Translations.confirmDiscardTracked(trackedResources);

        const yesAll = i18n.Translations.discardAll(resources);
        const pick = await window.showWarningMessage(message, { modal: true }, yesTracked, yesAll);

        if (pick === yesTracked) {
            resources = trackedResources;
        } else if (pick !== yesAll) {
            return;
        }

        await repository.clean(resources.map(r => r.state.resourceUri));
    }
}

export function createCommand(): ScmCommand {
    return {
        commandId: "git.cleanAll",
        method: cleanAll,
        options: {
            repository: true,
        },
    };
}
