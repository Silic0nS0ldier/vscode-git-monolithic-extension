import { window } from "vscode";
import { FinalRepository } from "../../repository/repository-class/mod.js";
import { localize } from "../../util.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function undoCommit(repository: FinalRepository): Promise<void> {
        const HEAD = repository.HEAD;

        if (!HEAD || !HEAD.commit) {
            window.showWarningMessage(localize("no more", "Can't undo because HEAD doesn't point to any commit."));
            return;
        }

        const commit = await repository.getCommit("HEAD");

        if (commit.parents.length > 1) {
            const yes = localize("undo commit", "Undo merge commit");
            const result = await window.showWarningMessage(
                localize("merge commit", "The last commit was a merge commit. Are you sure you want to undo it?"),
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

        repository.inputBox.value = commit.message;
    }

    return {
        commandId: "git.undoCommit",
        method: undoCommit,
        options: {
            repository: true,
        },
    };
}
