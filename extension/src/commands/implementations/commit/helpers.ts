import { Uri, window, workspace } from "vscode";
import { type CommitOptions, Status } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { isDescendant, pathEquals } from "../../../util/paths.js";
import { push, PushType } from "../push/helpers.js";
import { sync } from "../sync/sync.js";

async function smartCommit(
    repository: AbstractRepository,
    getCommitMessage: () => Promise<string | undefined>,
    model: Model,
    opts?: CommitOptions,
): Promise<boolean> {
    const repositoryUri = Uri.file(repository.root);
    let promptToSaveFilesBeforeCommit = config.promptToSaveFilesBeforeCommit(repositoryUri);

    // TODO Leftovers
    // migration
    if (promptToSaveFilesBeforeCommit as any === true) {
        promptToSaveFilesBeforeCommit = "always";
    } else if (promptToSaveFilesBeforeCommit as any === false) {
        promptToSaveFilesBeforeCommit = "never";
    }

    const enableSmartCommit = config.enableSmartCommit(repositoryUri);
    const enableCommitSigning = config.enableCommitSigning(repositoryUri);
    let noStagedChanges = repository.sourceControlUI.stagedGroup.resourceStates.get().length === 0;
    let noUnstagedChanges = repository.sourceControlUI.trackedGroup.resourceStates.get().length === 0;

    if (promptToSaveFilesBeforeCommit !== "never") {
        let documents = workspace.textDocuments
            .filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

        if (
            promptToSaveFilesBeforeCommit === "staged"
            || repository.sourceControlUI.stagedGroup.resourceStates.get().length > 0
        ) {
            documents = documents
                .filter(d =>
                    repository.sourceControlUI.stagedGroup.resourceStates.get().some(s =>
                        pathEquals(s.state.resourceUri.fsPath, d.uri.fsPath)
                    )
                );
        }

        if (documents.length > 0) {
            const message = i18n.Translations.unsavedCommitFiles(documents);
            const saveAndCommit = i18n.Translations.saveAndCommit();
            const commit = i18n.Translations.commitStaged();
            const pick = await window.showWarningMessage(message, { modal: true }, saveAndCommit, commit);

            if (pick === saveAndCommit) {
                await Promise.all(documents.map(d => d.save()));
                await repository.add(documents.map(d => d.uri));

                noStagedChanges = repository.sourceControlUI.stagedGroup.resourceStates.get().length === 0;
                noUnstagedChanges = repository.sourceControlUI.trackedGroup.resourceStates.get().length === 0;
            } else if (pick !== commit) {
                return false; // do not commit on cancel
            }
        }
    }

    let normalisedOpts = opts;
    if (!normalisedOpts) {
        normalisedOpts = { all: noStagedChanges };
    } else if (!normalisedOpts.all && noStagedChanges && !normalisedOpts.empty) {
        normalisedOpts = { ...normalisedOpts, all: true };
    }

    // no changes, and the user has not configured to commit all in this case
    if (!noUnstagedChanges && noStagedChanges && !enableSmartCommit && !normalisedOpts.empty) {
        const suggestSmartCommit = config.suggestSmartCommit(repositoryUri);

        if (!suggestSmartCommit) {
            return false;
        }

        // prompt the user if we want to commit all or not
        const message = i18n.Translations.noStagedChanges();
        const yes = i18n.Translations.yes();
        const always = i18n.Translations.always();
        const never = i18n.Translations.never();
        const pick = await window.showWarningMessage(message, { modal: true }, yes, always, never);

        if (pick === always) {
            await config.enableSmartCommit.update(true, true, repositoryUri);
        } else if (pick === never) {
            await config.suggestSmartCommit.update(false, true, repositoryUri);
            return false;
        } else if (pick !== yes) {
            return false; // do not commit on cancel
        }
    }

    // enable signing of commits if configured
    normalisedOpts.signCommit = enableCommitSigning;

    if (config.alwaysSignOff(repositoryUri)) {
        normalisedOpts.signoff = true;
    }

    const smartCommitChanges = config.smartCommitChanges(repositoryUri);

    if (
        (
            // no changes
            (noStagedChanges && noUnstagedChanges)
            // or no staged changes and not `all`
            || (!normalisedOpts.all && noStagedChanges)
            // no staged changes and no tracked unstaged changes
            || (noStagedChanges && smartCommitChanges === "tracked"
                && repository.sourceControlUI.trackedGroup.resourceStates.get().every(r =>
                    r.state.type === Status.UNTRACKED
                ))
        )
        // amend allows changing only the commit message
        && !normalisedOpts.amend
        && !normalisedOpts.empty
    ) {
        const commitAnyway = i18n.Translations.commitAnyway();
        const answer = await window.showInformationMessage(
            i18n.Translations.noChanges(),
            commitAnyway,
        );

        if (answer !== commitAnyway) {
            return false;
        }

        normalisedOpts.empty = true;
    }

    if (normalisedOpts.noVerify) {
        if (!config.allowNoVerifyCommit(repositoryUri)) {
            await window.showErrorMessage(
                i18n.Translations.commitRequiresVerification(),
            );
            return false;
        }

        if (config.confirmNoVerifyCommit(repositoryUri)) {
            const message = i18n.Translations.confirmCommitWithoutVerification();
            const yes = i18n.Translations.ok();
            const neverAgain = i18n.Translations.neverAgain3();
            const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

            if (pick === neverAgain) {
                await config.confirmNoVerifyCommit.update(false, true, repositoryUri);
            } else if (pick !== yes) {
                return false;
            }
        }
    }

    let message = await getCommitMessage();

    if (!message && !normalisedOpts.amend) {
        return false;
    }

    if (normalisedOpts.all && smartCommitChanges === "tracked") {
        normalisedOpts.all = "tracked";
    }

    if (normalisedOpts.all && config.untrackedChanges(repositoryUri) !== "mixed") {
        normalisedOpts.all = "tracked";
    }

    await repository.commit(message, normalisedOpts);

    const postCommitCommand = config.postCommitCommand(repositoryUri);

    switch (postCommitCommand) {
        case "push":
            await push(repository, { pushType: PushType.Push, silent: true }, model);
            break;
        case "sync":
            await sync(
                repository,
                model,
            );
            break;
    }

    return true;
}

export async function commitWithAnyInput(
    repository: AbstractRepository,
    model: Model,
    opts?: CommitOptions,
): Promise<void> {
    const message = repository.sourceControlUI.sourceControl.inputBox.value;
    const getCommitMessage = async (): Promise<string | undefined> => {
        let _message: string | undefined = message;

        if (!_message) {
            let value: string | undefined = undefined;

            if (opts && opts.amend && repository.HEAD && repository.HEAD.commit) {
                return undefined;
            }

            const branchName = repository.headShortName;
            let placeHolder = i18n.Translations.commitMessage(branchName);

            _message = await window.showInputBox({
                ignoreFocusOut: true,
                placeHolder,
                prompt: i18n.Translations.provideCommitMessage(),
                value,
            });
        }

        return _message;
    };

    const didCommit = await smartCommit(repository, getCommitMessage, model, opts);

    if (message && didCommit) {
        repository.sourceControlUI.sourceControl.inputBox.value = await repository.getInputTemplate();
    }
}

export async function commitEmpty(
    repository: AbstractRepository,
    model: Model,
    noVerify?: boolean,
): Promise<void> {
    const root = Uri.file(repository.root);
    const shouldPrompt = config.confirmEmptyCommits(root);

    if (shouldPrompt) {
        const message = i18n.Translations.confirmEmptyCommit();
        const yes = i18n.Translations.yes();
        const neverAgain = i18n.Translations.yesNeverAgain();
        const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

        if (pick === neverAgain) {
            await config.confirmEmptyCommits.update(false, true, root);
        } else if (pick !== yes) {
            return;
        }
    }

    await commitWithAnyInput(repository, model, { empty: true, noVerify });
}
