import * as path from "node:path";
import { Uri, window, workspace } from "vscode";
import { CommitOptions, Status } from "../../../api/git.js";
import { Model } from "../../../model.js";
import { Repository } from "../../../repository.js";
import { isDescendant, localize, pathEquals } from "../../../util.js";
import { push, PushType } from "../push/helpers.js";
import { sync } from "../sync/sync.js";

async function smartCommit(
    repository: Repository,
    getCommitMessage: () => Promise<string | undefined>,
    model: Model,
    opts?: CommitOptions,
): Promise<boolean> {
    const config = workspace.getConfiguration("git", Uri.file(repository.root));
    let promptToSaveFilesBeforeCommit = config.get<"always" | "staged" | "never">("promptToSaveFilesBeforeCommit");

    // migration
    if (promptToSaveFilesBeforeCommit as any === true) {
        promptToSaveFilesBeforeCommit = "always";
    } else if (promptToSaveFilesBeforeCommit as any === false) {
        promptToSaveFilesBeforeCommit = "never";
    }

    const enableSmartCommit = config.get<boolean>("enableSmartCommit") === true;
    const enableCommitSigning = config.get<boolean>("enableCommitSigning") === true;
    let noStagedChanges = repository.indexGroup.resourceStates.length === 0;
    let noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;

    if (promptToSaveFilesBeforeCommit !== "never") {
        let documents = workspace.textDocuments
            .filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

        if (promptToSaveFilesBeforeCommit === "staged" || repository.indexGroup.resourceStates.length > 0) {
            documents = documents
                .filter(d =>
                    repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath))
                );
        }

        if (documents.length > 0) {
            const message = documents.length === 1
                ? localize(
                    "unsaved files single",
                    "The following file has unsaved changes which won't be included in the commit if you proceed: {0}.\n\nWould you like to save it before committing?",
                    path.basename(documents[0].uri.fsPath),
                )
                : localize(
                    "unsaved files",
                    "There are {0} unsaved files.\n\nWould you like to save them before committing?",
                    documents.length,
                );
            const saveAndCommit = localize("save and commit", "Save All & Commit");
            const commit = localize("commit", "Commit Staged Changes");
            const pick = await window.showWarningMessage(message, { modal: true }, saveAndCommit, commit);

            if (pick === saveAndCommit) {
                await Promise.all(documents.map(d => d.save()));
                await repository.add(documents.map(d => d.uri));

                noStagedChanges = repository.indexGroup.resourceStates.length === 0;
                noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;
            } else if (pick !== commit) {
                return false; // do not commit on cancel
            }
        }
    }

    if (!opts) {
        opts = { all: noStagedChanges };
    } else if (!opts.all && noStagedChanges && !opts.empty) {
        opts = { ...opts, all: true };
    }

    // no changes, and the user has not configured to commit all in this case
    if (!noUnstagedChanges && noStagedChanges && !enableSmartCommit && !opts.empty) {
        const suggestSmartCommit = config.get<boolean>("suggestSmartCommit") === true;

        if (!suggestSmartCommit) {
            return false;
        }

        // prompt the user if we want to commit all or not
        const message = localize(
            "no staged changes",
            "There are no staged changes to commit.\n\nWould you like to stage all your changes and commit them directly?",
        );
        const yes = localize("yes", "Yes");
        const always = localize("always", "Always");
        const never = localize("never", "Never");
        const pick = await window.showWarningMessage(message, { modal: true }, yes, always, never);

        if (pick === always) {
            config.update("enableSmartCommit", true, true);
        } else if (pick === never) {
            config.update("suggestSmartCommit", false, true);
            return false;
        } else if (pick !== yes) {
            return false; // do not commit on cancel
        }
    }

    // enable signing of commits if configured
    opts.signCommit = enableCommitSigning;

    if (config.get<boolean>("alwaysSignOff")) {
        opts.signoff = true;
    }

    const smartCommitChanges = config.get<"all" | "tracked">("smartCommitChanges");

    if (
        (
            // no changes
            (noStagedChanges && noUnstagedChanges)
            // or no staged changes and not `all`
            || (!opts.all && noStagedChanges)
            // no staged changes and no tracked unstaged changes
            || (noStagedChanges && smartCommitChanges === "tracked"
                && repository.workingTreeGroup.resourceStates.every(r => r.type === Status.UNTRACKED))
        )
        // amend allows changing only the commit message
        && !opts.amend
        && !opts.empty
    ) {
        const commitAnyway = localize("commit anyway", "Create Empty Commit");
        const answer = await window.showInformationMessage(
            localize("no changes", "There are no changes to commit."),
            commitAnyway,
        );

        if (answer !== commitAnyway) {
            return false;
        }

        opts.empty = true;
    }

    if (opts.noVerify) {
        if (!config.get<boolean>("allowNoVerifyCommit")) {
            await window.showErrorMessage(
                localize(
                    "no verify commit not allowed",
                    "Commits without verification are not allowed, please enable them with the 'git.allowNoVerifyCommit' setting.",
                ),
            );
            return false;
        }

        if (config.get<boolean>("confirmNoVerifyCommit")) {
            const message = localize(
                "confirm no verify commit",
                "You are about to commit your changes without verification, this skips pre-commit hooks and can be undesirable.\n\nAre you sure to continue?",
            );
            const yes = localize("ok", "OK");
            const neverAgain = localize("never ask again", "OK, Don't Ask Again");
            const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

            if (pick === neverAgain) {
                config.update("confirmNoVerifyCommit", false, true);
            } else if (pick !== yes) {
                return false;
            }
        }
    }

    let message = await getCommitMessage();

    if (!message && !opts.amend) {
        return false;
    }

    if (opts.all && smartCommitChanges === "tracked") {
        opts.all = "tracked";
    }

    if (opts.all && config.get<"mixed" | "separate" | "hidden">("untrackedChanges") !== "mixed") {
        opts.all = "tracked";
    }

    await repository.commit(message, opts);

    const postCommitCommand = config.get<"none" | "push" | "sync">("postCommitCommand");

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
    repository: Repository,
    model: Model,
    opts?: CommitOptions,
): Promise<void> {
    const message = repository.inputBox.value;
    const getCommitMessage = async () => {
        let _message: string | undefined = message;

        if (!_message) {
            let value: string | undefined = undefined;

            if (opts && opts.amend && repository.HEAD && repository.HEAD.commit) {
                return undefined;
            }

            const branchName = repository.headShortName;
            let placeHolder: string;

            if (branchName) {
                placeHolder = localize("commitMessageWithHeadLabel2", "Message (commit on '{0}')", branchName);
            } else {
                placeHolder = localize("commit message", "Commit message");
            }

            _message = await window.showInputBox({
                value,
                placeHolder,
                prompt: localize("provide commit message", "Please provide a commit message"),
                ignoreFocusOut: true,
            });
        }

        return _message;
    };

    const didCommit = await smartCommit(repository, getCommitMessage, model, opts);

    if (message && didCommit) {
        repository.inputBox.value = await repository.getInputTemplate();
    }
}

export async function commitEmpty(
    repository: Repository,
    model: Model,
    noVerify?: boolean,
): Promise<void> {
    const root = Uri.file(repository.root);
    const config = workspace.getConfiguration("git", root);
    const shouldPrompt = config.get<boolean>("confirmEmptyCommits") === true;

    if (shouldPrompt) {
        const message = localize("confirm emtpy commit", "Are you sure you want to create an empty commit?");
        const yes = localize("yes", "Yes");
        const neverAgain = localize("yes never again", "Yes, Don't Show Again");
        const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

        if (pick === neverAgain) {
            await config.update("confirmEmptyCommits", false, true);
        } else if (pick !== yes) {
            return;
        }
    }

    await commitWithAnyInput(repository, model, { empty: true, noVerify });
}
