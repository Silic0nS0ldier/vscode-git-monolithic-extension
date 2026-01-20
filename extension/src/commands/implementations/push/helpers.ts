import { Uri, window } from "vscode";
import { ForcePushMode, type ForcePushModeOptions, GitErrorCodes } from "../../../api/git.js";
import { GitError } from "../../../git/error.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { publish } from "../publish/publish.js";

export type PushTypeOptions = "Push" | "PushFollowTags" | "PushTags" | "PushTo";
export const PushType: Record<PushTypeOptions, PushTypeOptions> = {
    Push: "Push",
    PushFollowTags: "PushFollowTags",
    PushTags: "PushTags",
    PushTo: "PushTo",
};

export interface PushOptions {
    pushType: PushTypeOptions;
    forcePush?: boolean;
    silent?: boolean;

    pushTo?: {
        remote?: string;
        refspec?: string;
        setUpstream?: boolean;
    };
}

export async function push(repository: AbstractRepository, pushOptions: PushOptions): Promise<void> {
    const remotes = repository.remotes;

    if (remotes.length === 0) {
        window.showWarningMessage(
            i18n.Translations.noRemotesToPublish(),
        );
        return;
    }

    const repositoryUri = Uri.file(repository.root);
    let forcePushMode: ForcePushModeOptions | undefined = undefined;

    if (pushOptions.forcePush) {
        if (!config.allowForcePush(repositoryUri)) {
            await window.showErrorMessage(
                i18n.Translations.forcePushNotAllowed(),
            );
            return;
        }

        forcePushMode = config.useForcePushWithLease(repositoryUri)
            ? ForcePushMode.ForceWithLease
            : ForcePushMode.Force;

        if (config.useForcePushWithLease(repositoryUri)) {
            const message = i18n.Translations.confirmForcePush();
            const yes = i18n.Translations.ok();
            const neverAgain = i18n.Translations.neverAgain2();
            const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

            if (pick === neverAgain) {
                await config.confirmForcePush.update(false, true, repositoryUri);
            } else if (pick !== yes) {
                return;
            }
        }
    }

    if (pushOptions.pushType === PushType.PushFollowTags) {
        await repository.pushFollowTags(undefined, forcePushMode);
        return;
    }

    if (pushOptions.pushType === PushType.PushTags) {
        await repository.pushTags(undefined, forcePushMode);
    }

    if (!repository.HEAD || !repository.HEAD.name) {
        if (!pushOptions.silent) {
            window.showWarningMessage(i18n.Translations.noBranch());
        }
        return;
    }

    if (pushOptions.pushType === PushType.Push) {
        try {
            await repository.push(repository.HEAD, forcePushMode);
        } catch (err) {
            if (!(err instanceof GitError && err.gitErrorCode == GitErrorCodes.NoUpstreamBranch)) {
                throw err;
            }

            if (pushOptions.silent) {
                return;
            }

            const branchName = repository.HEAD.name;
            const message = i18n.Translations.confirmPublishBranch(branchName);
            const yes = i18n.Translations.ok();
            const pick = await window.showWarningMessage(message, { modal: true }, yes);

            if (pick === yes) {
                await publish(
                    repository,
                );
            }
        }
    } else {
        const branchName = repository.HEAD.name;
        if (!pushOptions.pushTo?.remote) {
            // TODO Unhandled
            return;
        } else {
            await repository.pushTo(
                pushOptions.pushTo.remote,
                pushOptions.pushTo.refspec || branchName,
                pushOptions.pushTo.setUpstream,
                forcePushMode,
            );
        }
    }
}
