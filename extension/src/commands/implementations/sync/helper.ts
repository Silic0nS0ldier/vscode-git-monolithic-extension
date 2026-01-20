import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { publish } from "../publish/publish.js";

export async function sync(
    repository: AbstractRepository,
    rebase: boolean,
): Promise<void> {
    const HEAD = repository.HEAD;

    if (!HEAD) {
        return;
    } else if (!HEAD.upstream) {
        const branchName = HEAD.name;
        // TODO Address nullability issue
        const message = i18n.Translations.confirmPublishBranch(branchName ?? "(undefined)");
        const yes = i18n.Translations.ok();
        const pick = await window.showWarningMessage(message, { modal: true }, yes);

        if (pick === yes) {
            await publish(
                repository,
            );
        }
        return;
    }

    const remoteName = HEAD.remote || HEAD.upstream.remote;
    const remote = repository.remotes.find(r => r.name === remoteName);
    const isReadonly = remote && remote.isReadOnly;

    const shouldPrompt = !isReadonly && config.confirmSync();

    if (shouldPrompt) {
        const message = i18n.Translations.syncIsUnpredictable2(
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
        const yes = i18n.Translations.ok();
        const neverAgain = i18n.Translations.neverAgain2();
        const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

        if (pick === neverAgain) {
            await config.confirmSync.update(false, true);
        } else if (pick !== yes) {
            return;
        }
    }

    if (rebase) {
        await repository.syncRebase(HEAD);
    } else {
        await repository.sync(HEAD);
    }
}
