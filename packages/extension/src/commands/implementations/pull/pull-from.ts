import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function pullFrom(repository: AbstractRepository): Promise<void> {
        const remotes = repository.remotes;

        if (remotes.length === 0) {
            window.showWarningMessage(
                i18n.Translations.noRemotesToPull(),
            );
            return;
        }

        const remotePicks = remotes.filter(r => r.fetchUrl !== undefined).map(r => ({
            description: r.fetchUrl!,
            label: r.name,
        }));
        const placeHolder = i18n.Translations.pickRemotePull();
        const remotePick = await window.showQuickPick(remotePicks, { placeHolder });

        if (!remotePick) {
            return;
        }

        const remoteRefs = repository.refs;
        const remoteRefsFiltered = remoteRefs.filter(r => (r.remote === remotePick.label));
        const branchPicks = remoteRefsFiltered.map(r => ({ label: r.name! }));
        const branchPlaceHolder = i18n.Translations.pickBranchPull();
        const branchPick = await window.showQuickPick(branchPicks, { placeHolder: branchPlaceHolder });

        if (!branchPick) {
            return;
        }

        const remoteCharCnt = remotePick.label.length;

        await repository.pullFrom(false, remotePick.label, branchPick.label.slice(remoteCharCnt + 1));
    }

    return {
        commandId: "git.pullFrom",
        method: pullFrom,
        options: {
            repository: true,
        },
    };
}
