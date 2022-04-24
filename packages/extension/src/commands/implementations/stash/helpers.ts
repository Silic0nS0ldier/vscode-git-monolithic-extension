import { Uri, window, workspace } from "vscode";
import type { Stash } from "../../../git/Stash.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isDescendant, pathEquals } from "../../../util/paths.js";

export async function createStash(repository: AbstractRepository, includeUntracked = false): Promise<void> {
    const noUnstagedChanges = repository.sourceControlUI.trackedGroup.resourceStates.get().length === 0
        && (!includeUntracked || repository.sourceControlUI.untrackedGroup.resourceStates.get().length === 0);
    const noStagedChanges = repository.sourceControlUI.stagedGroup.resourceStates.get().length === 0;

    if (noUnstagedChanges && noStagedChanges) {
        window.showInformationMessage(i18n.Translations.noChangesStash());
        return;
    }

    const config = workspace.getConfiguration("git", Uri.file(repository.root));
    const promptToSaveFilesBeforeStashing = config.get<"always" | "staged" | "never">("promptToSaveFilesBeforeStash");

    if (promptToSaveFilesBeforeStashing !== "never") {
        let documents = workspace.textDocuments
            .filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

        if (
            promptToSaveFilesBeforeStashing === "staged"
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
            const message = i18n.Translations.unsavedStashFiles(documents);
            const saveAndStash = i18n.Translations.saveAndStash();
            const stash = i18n.Translations.stash();
            const pick = await window.showWarningMessage(message, { modal: true }, saveAndStash, stash);

            if (pick === saveAndStash) {
                await Promise.all(documents.map(d => d.save()));
            } else if (pick !== stash) {
                return; // do not stash on cancel
            }
        }
    }

    let message: string | undefined;

    if (
        config.get<boolean>("useCommitInputAsStashMessage")
        && (!repository.sourceControlUI.sourceControl.commitTemplate
            || repository.sourceControlUI.sourceControl.inputBox.value
                !== repository.sourceControlUI.sourceControl.commitTemplate)
    ) {
        message = repository.sourceControlUI.sourceControl.inputBox.value;
    }

    message = await window.showInputBox({
        placeHolder: i18n.Translations.stashMessage(),
        prompt: i18n.Translations.provideStashMessage(),
        value: message,
    });

    if (typeof message === "undefined") {
        return;
    }

    await repository.createStash(message, includeUntracked);
}

export async function pickStash(repository: AbstractRepository, placeHolder: string): Promise<Stash | undefined> {
    const stashes = await repository.getStashes();

    if (stashes.length === 0) {
        window.showInformationMessage(i18n.Translations.noStashes());
        return;
    }

    const picks = stashes.map(stash => ({
        description: "",
        details: "",
        label: `#${stash.index}:  ${stash.description}`,
        stash,
    }));
    const result = await window.showQuickPick(picks, { placeHolder });
    return result && result.stash;
}
