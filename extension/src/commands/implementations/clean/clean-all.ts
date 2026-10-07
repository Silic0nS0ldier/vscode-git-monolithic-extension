import { window } from "vscode";
import { Status } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { cleanTrackedChanges, cleanUntrackedChanges } from "./helpers.js";

export async function cleanAll(repository: AbstractRepository): Promise<void> {
    // TODO trackedGroup never holds UNTRACKED/IGNORED, so untracked files are never discarded.
    // Include untrackedGroup when `untrackedChanges` is "mixed" (as stage-all does), or drop the split.
    const resources = repository.sourceControlUI.trackedGroup.resourceStates.get();

    if (resources.length === 0) {
        return;
    }

    const { tracked = [], untrackedOrIgnored = [] } = Object.groupBy(
        resources,
        r => r.state.type === Status.UNTRACKED || r.state.type === Status.IGNORED
            ? "untrackedOrIgnored"
            : "tracked",
    );

    if (untrackedOrIgnored.length === 0) {
        await cleanTrackedChanges(repository, tracked);
    } else if (tracked.length === 0) {
        await cleanUntrackedChanges(repository, untrackedOrIgnored);
    } else {
        const message = i18n.Translations.confirmDiscard2(
            i18n.Translations.warnUntracked2(untrackedOrIgnored),
            resources,
        );
        const yesTracked = i18n.Translations.confirmDiscardTracked(tracked);
        const yesAll = i18n.Translations.discardAll(resources);
        const pick = await window.showWarningMessage(message, { modal: true }, yesTracked, yesAll);

        if (pick === yesTracked) {
            await repository.clean(tracked.map(r => r.state.resourceUri));
        } else if (pick === yesAll) {
            await repository.clean(resources.map(r => r.state.resourceUri));
        }
    }
}

export function createCommand(): ScmCommand {
    return {
        commandId: makeCommandId("cleanAll"),
        method: cleanAll,
        options: {
            repository: true,
        },
    };
}
