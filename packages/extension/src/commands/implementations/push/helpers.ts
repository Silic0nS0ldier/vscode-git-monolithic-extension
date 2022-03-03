import { Uri, window, workspace } from "vscode";
import { ForcePushMode, GitErrorCodes } from "../../../api/git.js";
import { Model } from "../../../model.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { publish } from "../publish/publish.js";
import { AddRemoteItem } from "../publish/quick-pick.js";
import { addRemote as addRemoteFn } from "../remote/add-remote.js";

export enum PushType {
    Push,
    PushTo,
    PushFollowTags,
    PushTags,
}

export interface PushOptions {
    pushType: PushType;
    forcePush?: boolean;
    silent?: boolean;

    pushTo?: {
        remote?: string;
        refspec?: string;
        setUpstream?: boolean;
    };
}

export async function push(repository: FinalRepository, pushOptions: PushOptions, model: Model) {
    const remotes = repository.remotes;

    if (remotes.length === 0) {
        if (pushOptions.silent) {
            return;
        }

        const addRemote = localize("addremote", "Add Remote");
        const result = await window.showWarningMessage(
            localize("no remotes to push", "Your repository has no remotes configured to push to."),
            addRemote,
        );

        if (result === addRemote) {
            await addRemoteFn(model, repository);
        }

        return;
    }

    const config = workspace.getConfiguration("git", Uri.file(repository.root));
    let forcePushMode: ForcePushMode | undefined = undefined;

    if (pushOptions.forcePush) {
        if (!config.get<boolean>("allowForcePush")) {
            await window.showErrorMessage(
                localize(
                    "force push not allowed",
                    "Force push is not allowed, please enable it with the 'git.allowForcePush' setting.",
                ),
            );
            return;
        }

        forcePushMode = config.get<boolean>("useForcePushWithLease") === true
            ? ForcePushMode.ForceWithLease
            : ForcePushMode.Force;

        if (config.get<boolean>("confirmForcePush")) {
            const message = localize(
                "confirm force push",
                "You are about to force push your changes, this can be destructive and could inadvertently overwrite changes made by others.\n\nAre you sure to continue?",
            );
            const yes = localize("ok", "OK");
            const neverAgain = localize("never ask again", "OK, Don't Ask Again");
            const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

            if (pick === neverAgain) {
                config.update("confirmForcePush", false, true);
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
            window.showWarningMessage(localize("nobranch", "Please check out a branch to push to a remote."));
        }
        return;
    }

    if (pushOptions.pushType === PushType.Push) {
        try {
            await repository.push(repository.HEAD, forcePushMode);
        } catch (err) {
            if (err.gitErrorCode !== GitErrorCodes.NoUpstreamBranch) {
                throw err;
            }

            if (pushOptions.silent) {
                return;
            }

            const branchName = repository.HEAD.name;
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
        }
    } else {
        const branchName = repository.HEAD.name;
        if (!pushOptions.pushTo?.remote) {
            const addRemote = new AddRemoteItem(addRemoteFn.bind(null, model));
            const picks = [
                ...remotes.filter(r => r.pushUrl !== undefined).map(r => ({ description: r.pushUrl, label: r.name })),
                addRemote,
            ];
            const placeHolder = localize("pick remote", "Pick a remote to publish the branch '{0}' to:", branchName);
            const choice = await window.showQuickPick(picks, { placeHolder });

            if (!choice) {
                return;
            }

            if (choice === addRemote) {
                const newRemote = await addRemoteFn(model, repository);

                if (newRemote) {
                    await repository.pushTo(newRemote, branchName, undefined, forcePushMode);
                }
            } else {
                await repository.pushTo(choice.label, branchName, undefined, forcePushMode);
            }
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
