import { window, workspace } from "vscode";
import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import { publish } from "../publish/publish.js";

export async function sync(
    repository: AbstractRepository,
    rebase: boolean,
    model: Model,
): Promise<void> {
    const HEAD = repository.HEAD;

    if (!HEAD) {
        return;
    } else if (!HEAD.upstream) {
        const branchName = HEAD.name;
        const message = localize(
            "confirm publish branch",
            "The branch '{0}' has no upstream branch. Would you like to publish this branch?",
            branchName,
        );
        const yes = localize("ok", "OK");
        const pick = await window.showWarningMessage(message, { modal: true }, yes);

        if (pick === yes) {
            await publish(
                model,
                repository,
            );
        }
        return;
    }

    const remoteName = HEAD.remote || HEAD.upstream.remote;
    const remote = repository.remotes.find(r => r.name === remoteName);
    const isReadonly = remote && remote.isReadOnly;

    const config = workspace.getConfiguration("git");
    const shouldPrompt = !isReadonly && config.get<boolean>("confirmSync") === true;

    if (shouldPrompt) {
        const message = localize(
            "sync is unpredictable",
            "This action will push and pull commits to and from '{0}/{1}'.",
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
        const yes = localize("ok", "OK");
        const neverAgain = localize("never again", "OK, Don't Show Again");
        const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

        if (pick === neverAgain) {
            await config.update("confirmSync", false, true);
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
