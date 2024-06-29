import { window } from "vscode";
import * as i18n from "../../i18n/mod.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function undoCommit(repository: AbstractRepository): Promise<void> {
        const HEAD = repository.HEAD;

        if (!HEAD || !HEAD.commit) {
            window.showWarningMessage(i18n.Translations.noMore());
            return;
        }

        const commit = await repository.getCommit("HEAD");

        if (commit.parents.length > 1) {
            const yes = i18n.Translations.undoCommit();
            const result = await window.showWarningMessage(
                i18n.Translations.mergeCommit(),
                { modal: true },
                yes,
            );

            if (result !== yes) {
                return;
            }
        }

        if (commit.parents.length > 0) {
            await repository.reset("HEAD~");
        } else {
            await repository.deleteRef("HEAD");
            await repository.revert([]);
        }

        repository.sourceControlUI.sourceControl.inputBox.value = commit.message;
    }

    return {
        commandId: "git.undoCommit",
        method: undoCommit,
        options: {
            repository: true,
        },
    };
}
